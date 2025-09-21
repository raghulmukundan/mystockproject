"""
Jobs API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from app.core.database import get_db
from app.db.models import JobConfiguration, JobExecutionStatus
from app.core.scheduler import scheduler
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.market_data_job import _update_market_data_job, update_market_data_job_bypass_hours
from app.services.eod_scan_job import _run_eod_scan_job
from app.services.universe_job import _refresh_universe_job
from app.services.tech_job import run_tech_job
import asyncio

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

class NextMarketRefreshResponse(BaseModel):
    next_run_at: Optional[str]

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
    
    for job in jobs:
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
        
        result.append(JobSummaryResponse(
            job_name=job.job_name,
            description=job.description,
            enabled=job.enabled,
            schedule_display=schedule_display,
            last_run=last_run_response
        ))
    
    return result

@router.get("/jobs/next-market-refresh", response_model=NextMarketRefreshResponse)
def get_next_market_refresh():
    """Return the next effective market data refresh time considering market hours."""
    try:
        job = scheduler.get_job("update_market_data")
        if not job or not job.next_run_time:
            return NextMarketRefreshResponse(next_run_at=None)
        
        # Next scheduled run time from APScheduler (tz-aware)
        dt_local = job.next_run_time
        return NextMarketRefreshResponse(next_run_at=dt_local.isoformat())
    except Exception:
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

# Manual job execution endpoints
@router.post("/jobs/market-data/run")
async def run_market_data_now():
    """Manually trigger market data refresh"""
    try:
        await _update_market_data_job()
        return {"message": "Market data refresh completed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/market-data/run-bypass-hours")
async def run_market_data_bypass_hours():
    """Trigger market data refresh bypassing market hours restriction"""
    try:
        await _update_market_data_job(bypass_market_hours=True)
        return {"message": "Market data refresh completed successfully (bypassed market hours)"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/eod-scan/run")
async def run_eod_scan_now():
    """Manually trigger EOD scan"""
    try:
        await _run_eod_scan_job()
        return {"message": "EOD scan completed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/universe/run")
async def run_universe_refresh_now():
    """Manually trigger universe refresh"""
    try:
        await _refresh_universe_job()
        return {"message": "Universe refresh completed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs/tech/run")
async def run_tech_analysis_now():
    """Manually trigger technical analysis"""
    try:
        await run_tech_job()
        return {"message": "Technical analysis completed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

