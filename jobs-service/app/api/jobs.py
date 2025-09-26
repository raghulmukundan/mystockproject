"""
Jobs API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from app.core.database import get_db
import asyncio
import threading
from app.db.models import JobConfiguration, JobExecutionStatus
from app.core.scheduler import scheduler
from app.services.job_status import begin_job, complete_job, fail_job, prune_history, is_job_running
from app.services.market_data_job import _update_market_data_job
from app.services.eod_scan_job import _run_eod_scan_job
from app.services.universe_job import _refresh_universe_job
from app.services.tech_job import run_tech_job
from app.services.ttl_cleanup_job import cleanup_old_job_records
from app.services.token_validation_job import validate_schwab_token_job
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class JobConfigurationResponse(BaseModel):
    id: int
    job_name: str
    description: str
    enabled: bool
    schedule_type: str
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    cron_day_of_week: Optional[str] = None
    cron_hour: Optional[int] = None
    cron_minute: Optional[int] = None
    only_market_hours: bool
    market_start_hour: Optional[int] = None
    market_end_hour: Optional[int] = None
    created_at: str
    updated_at: str

class JobConfigurationUpdate(BaseModel):
    enabled: Optional[bool] = None
    schedule_type: Optional[str] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    cron_day_of_week: Optional[str] = None
    cron_hour: Optional[int] = None
    cron_minute: Optional[int] = None
    only_market_hours: Optional[bool] = None
    market_start_hour: Optional[int] = None
    market_end_hour: Optional[int] = None

class JobStatusResponse(BaseModel):
    id: int
    job_name: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: Optional[int] = None
    records_processed: Optional[int] = None
    error_message: Optional[str] = None
    next_run_at: Optional[str] = None

def _iso_utc(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    try:
        # Treat naive datetimes as UTC and mark them explicitly
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc).isoformat()
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return dt.isoformat()

class JobSummaryResponse(BaseModel):
    job_name: str
    description: str
    enabled: bool
    schedule_display: str
    last_run: Optional[JobStatusResponse] = None
    next_run_at: Optional[str] = None

    class Config:
        extra = "forbid"

class NextMarketRefreshResponse(BaseModel):
    next_run_at: Optional[str]

class EodScanRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None

@router.get("/jobs", response_model=List[JobConfigurationResponse])
def get_all_jobs(db: Session = Depends(get_db)):
    """Get all job configurations"""
    jobs = db.query(JobConfiguration).all()
    return [
        JobConfigurationResponse(
            id=job.id,
            job_name=job.job_name,
            description=job.description,
            enabled=job.enabled,
            schedule_type=job.schedule_type,
            interval_value=job.interval_value,
            interval_unit=job.interval_unit,
            cron_day_of_week=job.cron_day_of_week,
            cron_hour=job.cron_hour,
            cron_minute=job.cron_minute,
            only_market_hours=job.only_market_hours,
            market_start_hour=job.market_start_hour,
            market_end_hour=job.market_end_hour,
            created_at=job.created_at.isoformat(),
            updated_at=job.updated_at.isoformat()
        )
        for job in jobs
    ]

@router.get("/jobs/summary", response_model=List[JobSummaryResponse])
def get_jobs_summary(db: Session = Depends(get_db)):
    """Get job summaries with last run status"""
    jobs = db.query(JobConfiguration).all()
    result = []

    # Mapping from job names to scheduler IDs
    scheduler_id_map = {
        'update_market_data': 'update_market_data',
        'nasdaq_universe_refresh': 'refresh_universe',
        'eod_price_scan': 'eod_price_scan',
        'technical_compute': 'eod_price_scan',  # Technical compute runs via EOD scan
        'job_ttl_cleanup': 'job_ttl_cleanup'
    }

    for job in jobs:
        # Skip deprecated job name (use nasdaq_universe_refresh instead)
        if job.job_name == "refresh_universe":
            continue
        # Get last execution status
        last_status = db.query(JobExecutionStatus).filter(
            JobExecutionStatus.job_name == job.job_name
        ).order_by(JobExecutionStatus.started_at.desc()).first()
        
        # Format schedule display
        if job.schedule_type == 'interval':
            schedule_display = f"Every {job.interval_value} {job.interval_unit}"
            if job.only_market_hours:
                schedule_display += " (market hours only)"
        else:  # cron
            if job.cron_day_of_week == 'sun':
                day_display = "Sunday"
            elif job.cron_day_of_week == 'mon,tue,wed,thu,fri':
                day_display = "Weekdays"
            elif job.cron_day_of_week == 'mon-fri':
                day_display = "mon-fri"
            elif job.cron_day_of_week is None:
                day_display = "Daily"
            else:
                day_display = job.cron_day_of_week
            schedule_display = f"{day_display} at {job.cron_hour:02d}:{job.cron_minute:02d}"
        
        last_run_response = None
        if last_status:
            last_run_response = JobStatusResponse(
                id=last_status.id,
                job_name=last_status.job_name,
                status=last_status.status,
                started_at=_iso_utc(last_status.started_at) or "",
                completed_at=_iso_utc(last_status.completed_at),
                duration_seconds=last_status.duration_seconds,
                records_processed=last_status.records_processed,
                error_message=last_status.error_message,
                next_run_at=_iso_utc(last_status.next_run_at)
            )
        
        # Get next run time from scheduler
        next_run_at = None
        scheduler_id = scheduler_id_map.get(job.job_name)
        if scheduler_id:
            try:
                scheduler_job = scheduler.get_job(scheduler_id)
                if scheduler_job and scheduler_job.next_run_time:
                    next_run_at = scheduler_job.next_run_time.isoformat()
                    logger.info(f"Found next_run_at for {job.job_name}: {next_run_at}")
                else:
                    logger.info(f"No scheduler job or next_run_time for {job.job_name} (scheduler_id={scheduler_id})")
            except Exception as e:
                logger.error(f"Error getting next_run_at for {job.job_name}: {e}")

        result.append(JobSummaryResponse(
            job_name=job.job_name,
            description=job.description,
            enabled=job.enabled,
            schedule_display=schedule_display,
            last_run=last_run_response,
            next_run_at=next_run_at
        ))
    
    return result

@router.get("/jobs/next-market-refresh", response_model=NextMarketRefreshResponse)
def get_next_market_refresh(db: Session = Depends(get_db)):
    """Return the next effective market data refresh time considering market hours."""
    try:
        job = scheduler.get_job("update_market_data")
        if not job or not job.next_run_time:
            return NextMarketRefreshResponse(next_run_at=None)

        # Get job configuration to check market hours restriction
        job_config = db.query(JobConfiguration).filter(
            JobConfiguration.job_name == "update_market_data"
        ).first()

        if not job_config:
            return NextMarketRefreshResponse(next_run_at=None)

        # Next scheduled run time from APScheduler (tz-aware)
        dt_local = job.next_run_time

        # If job is configured for market hours only, validate the next run time
        if job_config.only_market_hours:
            # Convert to local time for market hours check
            from datetime import timezone
            import pytz

            # Convert to CST (market timezone)
            cst = pytz.timezone('America/Chicago')
            dt_cst = dt_local.astimezone(cst)

            # Check if it's a weekday (Monday=0, Sunday=6)
            if dt_cst.weekday() >= 5:  # Saturday or Sunday
                return NextMarketRefreshResponse(next_run_at=None)

            # Check if it's within market hours (9 AM to 4 PM CST)
            hour = dt_cst.hour
            if hour < (job_config.market_start_hour or 9) or hour >= (job_config.market_end_hour or 16):
                return NextMarketRefreshResponse(next_run_at=None)

        return NextMarketRefreshResponse(next_run_at=dt_local.isoformat())
    except Exception as e:
        logger.error(f"Error getting next market refresh: {str(e)}")
        return NextMarketRefreshResponse(next_run_at=None)

@router.get("/jobs/{job_name}/status", response_model=List[JobStatusResponse])
def get_job_status_history(job_name: str, limit: int = 10, db: Session = Depends(get_db)):
    """Get job execution status history"""
    statuses = db.query(JobExecutionStatus).filter(
        JobExecutionStatus.job_name == job_name
    ).order_by(JobExecutionStatus.started_at.desc()).limit(limit).all()

    return [
        JobStatusResponse(
            id=status.id,
            job_name=status.job_name,
            status=status.status,
            started_at=_iso_utc(status.started_at) or "",
            completed_at=_iso_utc(status.completed_at),
            duration_seconds=status.duration_seconds,
            records_processed=status.records_processed,
            error_message=status.error_message,
            next_run_at=_iso_utc(status.next_run_at)
        )
        for status in statuses
    ]

async def _background_market_data():
    """Background task for market data refresh"""
    try:
        await _update_market_data_job()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Background market data refresh failed: {str(e)}")

# Manual job execution endpoints
@router.post("/jobs/market-data/run")
async def run_market_data_now(background_tasks: BackgroundTasks):
    """Manually trigger market data refresh"""
    try:
        background_tasks.add_task(_background_market_data)
        return {"message": "Market data refresh started successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _run_eod_scan_thread(start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Run EOD scan in a separate thread"""
    import logging
    from app.services.job_status import begin_job, complete_job, fail_job, prune_history, is_job_running
    logger = logging.getLogger(__name__)

    # Always record job status for manual runs
    job_name = "eod_price_scan"
    job_id = None

    try:
        job_id = begin_job(job_name)

        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        if start_date or end_date:
            from app.services.eod_scan_impl import run_eod_scan_all_symbols
            result = loop.run_until_complete(run_eod_scan_all_symbols(start_date=start_date, end_date=end_date))
        else:
            from app.services.eod_scan_impl import run_eod_scan_all_symbols
            result = loop.run_until_complete(run_eod_scan_all_symbols())

        loop.close()

        # Record completion with results
        symbols_requested = result.get('symbols_requested', 0)
        complete_job(job_id, records_processed=symbols_requested)
        prune_history(job_name, keep=5)

        logger.info("Background EOD scan completed successfully")
    except Exception as e:
        logger.error(f"Background EOD scan failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
    finally:
        try:
            loop.close()
        except:
            pass

@router.post("/jobs/eod-scan/run")
async def run_eod_scan_now(request: EodScanRequest = EodScanRequest()):
    """Manually trigger EOD scan with optional date range"""
    try:
        start_date = request.start_date
        end_date = request.end_date

        # Run EOD scan in a separate thread to avoid blocking the API
        thread = threading.Thread(
            target=_run_eod_scan_thread,
            args=(start_date, end_date),
            daemon=True
        )
        thread.start()

        if start_date and end_date:
            return {"message": f"EOD scan started for date range {start_date} to {end_date}"}
        elif start_date or end_date:
            return {"message": f"EOD scan started for date {start_date or end_date}"}
        else:
            return {"message": "EOD scan started successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def _background_universe_refresh():
    """Background task for universe refresh"""
    try:
        await _refresh_universe_job()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Background universe refresh failed: {str(e)}")

def _run_tech_analysis_thread():
    """Run technical analysis in a separate thread"""
    import logging
    from app.services.job_status import begin_job, complete_job, fail_job, prune_history, is_job_running
    logger = logging.getLogger(__name__)

    # Always record job status for manual runs
    job_name = "technical_compute"
    job_id = None

    try:
        job_id = begin_job(job_name)

        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        from app.services.tech_impl import run_technical_compute
        result = loop.run_until_complete(run_technical_compute())

        loop.close()

        # Record completion with results
        updated_symbols = result.get('updated_symbols', 0)
        complete_job(job_id, records_processed=updated_symbols)
        prune_history(job_name, keep=5)

        logger.info("Background technical analysis completed successfully")
    except Exception as e:
        logger.error(f"Background technical analysis failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
    finally:
        try:
            loop.close()
        except:
            pass

async def _background_tech_analysis():
    """Background task for technical analysis"""
    try:
        await run_tech_job()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Background technical analysis failed: {str(e)}")

@router.post("/jobs/universe/run")
async def run_universe_refresh_now(background_tasks: BackgroundTasks):
    """Manually trigger universe refresh"""
    try:
        background_tasks.add_task(_background_universe_refresh)
        return {"message": "Universe refresh started successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/tech/run")
async def run_tech_analysis_now():
    """Manually trigger technical analysis"""
    try:
        # Check if technical analysis is already running
        if is_job_running("technical_compute"):
            raise HTTPException(status_code=409, detail="Technical analysis job is already running")

        # Run technical analysis in a separate thread to avoid blocking the API
        thread = threading.Thread(
            target=_run_tech_analysis_thread,
            daemon=True
        )
        thread.start()

        return {"message": "Technical analysis started successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/job_ttl_cleanup/run")
async def run_ttl_cleanup_now():
    """Manually trigger TTL cleanup job"""
    try:
        cleanup_old_job_records()
        return {"message": "TTL cleanup completed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/schwab_token_validation/run")
async def run_token_validation_now():
    """Manually trigger Schwab token validation job"""
    try:
        validate_schwab_token_job()
        return {"message": "Schwab token validation completed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/cleanup-stuck")
async def cleanup_stuck_jobs():
    """Clean up stuck jobs that are marked as 'running' but are no longer active"""
    from datetime import datetime, timezone
    from sqlalchemy import text
    from app.core.database import get_db

    try:
        db = next(get_db())
        try:
            cleanup_results = {
                "eod_scans": 0,
                "job_executions": 0,
                "message": "Cleanup completed successfully"
            }

            # Mark stuck EOD scans as failed
            result = db.execute(text("""
                UPDATE eod_scans
                SET status = 'failed', completed_at = :now
                WHERE status = 'running' AND completed_at IS NULL
                RETURNING id
            """), {"now": datetime.now(timezone.utc)})

            updated_scans = result.fetchall()
            cleanup_results["eod_scans"] = len(updated_scans)

            # Mark stuck job execution statuses as failed
            result = db.execute(text("""
                UPDATE job_execution_status
                SET status = 'failed'
                WHERE status = 'running' AND completed_at IS NULL
                RETURNING id
            """))

            updated_jobs = result.fetchall()
            cleanup_results["job_executions"] = len(updated_jobs)

            db.commit()
            return cleanup_results

        finally:
            db.close()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# EOD scan status endpoints
@router.get("/eod/scan/list")
async def get_eod_scans(limit: int = 20, db: Session = Depends(get_db)):
    """Get list of EOD scans"""
    from app.db.models import EodScan
    try:
        scans = db.query(EodScan).order_by(EodScan.started_at.desc()).limit(limit).all()
        return [
            {
                "id": scan.id,
                "status": scan.status,
                "scan_date": scan.scan_date,
                "started_at": scan.started_at.isoformat() if scan.started_at else None,
                "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
                "symbols_requested": scan.symbols_requested or 0,
                "symbols_fetched": scan.symbols_fetched or 0,
                "error_count": scan.error_count or 0,
            }
            for scan in scans
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/eod/scan/errors/{scan_id}")
async def get_eod_scan_errors(scan_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """Get errors for an EOD scan"""
    from app.db.models import EodScanError
    try:
        errors = db.query(EodScanError).filter(
            EodScanError.eod_scan_id == scan_id
        ).order_by(EodScanError.created_at.desc()).limit(limit).all()

        return [
            {
                "id": error.id,
                "symbol": error.symbol,
                "error_type": error.error_type,
                "error_message": error.error_message,
                "http_status": error.http_status,
                "occurred_at": error.created_at.isoformat() if error.created_at else None,
            }
            for error in errors
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Technical job status endpoints
@router.get("/technical/job/list")
async def get_technical_jobs(limit: int = 20, db: Session = Depends(get_db)):
    """Get list of technical analysis jobs"""
    from app.db.models import TechJob, TechJobError, TechJobSkip, TechJobSuccess
    try:
        jobs = db.query(TechJob).order_by(TechJob.started_at.desc()).limit(limit).all()
        result = []

        for job in jobs:
            # Get counts for errors, skips, and successes
            error_count = db.query(TechJobError).filter(TechJobError.tech_job_id == job.id).count()
            skip_count = db.query(TechJobSkip).filter(TechJobSkip.tech_job_id == job.id).count()
            success_count = db.query(TechJobSuccess).filter(TechJobSuccess.tech_job_id == job.id).count()

            result.append({
                "id": job.id,
                "status": job.status,
                "latest_trade_date": job.latest_trade_date,
                "started_at": job.started_at,
                "finished_at": job.finished_at,
                "total_symbols": job.total_symbols or 0,
                "updated_symbols": job.updated_symbols or 0,
                "daily_rows_upserted": job.daily_rows_upserted or 0,
                "latest_rows_upserted": job.latest_rows_upserted or 0,
                "errors": job.errors or 0,
                "error_count": error_count,
                "skip_count": skip_count,
                "success_count": success_count,
                "message": job.message,
            })

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/technical/job/errors/{job_id}")
async def get_technical_job_errors(job_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """Get errors for a technical analysis job"""
    from app.db.models import TechJobError
    try:
        errors = db.query(TechJobError).filter(
            TechJobError.tech_job_id == job_id
        ).order_by(TechJobError.occurred_at.desc()).limit(limit).all()

        return [
            {
                "id": error.id,
                "symbol": error.symbol,
                "error_message": error.error_message,
                "occurred_at": error.occurred_at.isoformat() if error.occurred_at else None,
            }
            for error in errors
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/technical/job/skips/{job_id}")
async def get_technical_job_skips(job_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """Get skips for a technical analysis job"""
    from app.db.models import TechJobSkip
    try:
        skips = db.query(TechJobSkip).filter(
            TechJobSkip.tech_job_id == job_id
        ).order_by(TechJobSkip.created_at.desc()).limit(limit).all()

        return [
            {
                "id": skip.id,
                "symbol": skip.symbol,
                "reason": skip.reason,
                "detail": skip.detail,
                "created_at": skip.created_at.isoformat() if skip.created_at else None,
            }
            for skip in skips
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/technical/job/successes/{job_id}")
async def get_technical_job_successes(job_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """Get successes for a technical analysis job"""
    from app.db.models import TechJobSuccess
    try:
        successes = db.query(TechJobSuccess).filter(
            TechJobSuccess.tech_job_id == job_id
        ).order_by(TechJobSuccess.created_at.desc()).limit(limit).all()

        return [
            {
                "id": success.id,
                "symbol": success.symbol,
                "date": success.date,
                "created_at": success.created_at.isoformat() if success.created_at else None,
            }
            for success in successes
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs/tech/status")
async def get_tech_job_status(db: Session = Depends(get_db)):
    """Get current technical analysis job status"""
    from app.services.job_status import get_job_latest_status
    try:
        # Get the latest job execution status
        latest_status = get_job_latest_status("technical_compute")

        if not latest_status:
            return []

        return [
            {
                "id": latest_status.id,
                "job_name": latest_status.job_name,
                "status": latest_status.status,
                "started_at": _iso_utc(latest_status.started_at),
                "completed_at": _iso_utc(latest_status.completed_at),
                "duration_seconds": latest_status.duration_seconds,
                "records_processed": latest_status.records_processed,
                "error_message": latest_status.error_message,
                "next_run_at": _iso_utc(latest_status.next_run_at)
            }
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/cleanup-duplicates")
async def cleanup_duplicate_jobs(db: Session = Depends(get_db)):
    """Remove duplicate/legacy job configurations"""
    try:
        # Remove the old tech_analysis job (replaced by technical_compute)
        deleted_job = db.query(JobConfiguration).filter(
            JobConfiguration.job_name == "tech_analysis"
        ).first()

        if deleted_job:
            db.delete(deleted_job)
            db.commit()
            return {"message": f"Removed duplicate job: tech_analysis", "deleted": 1}
        else:
            return {"message": "No duplicate jobs found", "deleted": 0}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))