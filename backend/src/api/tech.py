from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from typing import List, Optional
import time
import threading

from src.db.models import SessionLocal, TechJob, TechJobSkip, TechJobSuccess
from datetime import datetime, timezone
from src.services.tech.run import run_technical_compute
from src.services.tech.fetch_prices import get_latest_trade_date
from app.services.job_status import begin_job, complete_job, fail_job, prune_history, prune_tech_jobs


router = APIRouter()


class RunRequest(BaseModel):
    symbols: Optional[List[str]] = None


class RunResponse(BaseModel):
    job_id: int
    latest_trade_date: str
    total_symbols: int
    updated_symbols: int
    daily_rows_upserted: int
    latest_rows_upserted: int
    errors: int
    duration_s: float


@router.post("/api/tech/run", response_model=RunResponse)
async def tech_run(req: RunRequest):
    """Start technical compute in background and return immediately with a job id.

    The client can poll /api/tech/status/latest for live status.
    """
    started = time.time()
    job_name = 'technical_compute'
    job_id = begin_job(job_name)
    print(f"/api/tech/run accepted: job_id={job_id}")

    def _worker(job_id: int, symbols: Optional[List[str]]):
        try:
            result = run_technical_compute(symbols)
            processed = int(result.get('updated_symbols', 0))
            complete_job(job_id, records_processed=processed)
        except Exception as e:
            fail_job(job_id, str(e))
        finally:
            prune_history(job_name, keep=5)
            prune_tech_jobs(keep=5)

    t = threading.Thread(target=_worker, args=(job_id, req.symbols), daemon=True)
    t.start()
    print(f"/api/tech/run worker started: job_id={job_id}")

    # Best-effort latest_trade_date for a friendly response
    db = SessionLocal()
    try:
        ltd = get_latest_trade_date(db) or ""
    finally:
        db.close()

    duration = time.time() - started
    return RunResponse(
        job_id=job_id,
        latest_trade_date=ltd,
        total_symbols=0,
        updated_symbols=0,
        daily_rows_upserted=0,
        latest_rows_upserted=0,
        errors=0,
        duration_s=round(duration, 2),
    )


class JobSummary(BaseModel):
    job_id: int
    status: str
    latest_trade_date: str
    total_symbols: int
    updated_symbols: int
    daily_rows_upserted: int
    latest_rows_upserted: int
    errors: int
    started_at: str
    finished_at: Optional[str] = None


@router.get("/api/tech/status/latest", response_model=JobSummary)
async def tech_status_latest():
    db = SessionLocal()
    try:
        job = db.query(TechJob).order_by(TechJob.id.desc()).first()
        if not job:
            # No job yet; return 204 No Content to avoid frontend proxy errors
            return Response(status_code=204)
        return JobSummary(
            job_id=job.id,
            status=job.status,
            latest_trade_date=job.latest_trade_date,
            total_symbols=job.total_symbols,
            updated_symbols=job.updated_symbols,
            daily_rows_upserted=job.daily_rows_upserted,
            latest_rows_upserted=job.latest_rows_upserted,
            errors=job.errors,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )
    except Exception:
        # On any unexpected error, avoid throwing 500 at the dev proxy
        return Response(status_code=204)
    finally:
        db.close()


class JobListItem(BaseModel):
    id: int
    status: str
    started_at: str
    finished_at: Optional[str]
    updated_symbols: int
    total_symbols: int
    errors: int
    success_count: int
    skip_count: int


@router.get("/api/tech/jobs", response_model=List[JobListItem])
async def list_tech_jobs(start: Optional[str] = None, end: Optional[str] = None, limit: int = 50):
    """List tech jobs in a date range (inclusive) by started_at date (YYYY-MM-DD)."""
    db = SessionLocal()
    try:
        q = db.query(TechJob).order_by(TechJob.id.desc())
        if start:
            q = q.filter(TechJob.started_at >= start)
        if end:
            # add one day end boundary if needed; here assume ISO strings compare lexically
            q = q.filter(TechJob.started_at <= end + 'T23:59:59Z')
        rows = q.limit(min(500, max(1, limit))).all()
        out: List[JobListItem] = []
        for r in rows:
            # Aggregate counts for skips and successes
            success_count = db.query(TechJobSuccess).filter(TechJobSuccess.tech_job_id == r.id).count()
            skip_count = db.query(TechJobSkip).filter(TechJobSkip.tech_job_id == r.id).count()
            out.append(JobListItem(
                id=r.id,
                status=r.status,
                started_at=r.started_at,
                finished_at=r.finished_at,
                updated_symbols=r.updated_symbols,
                total_symbols=r.total_symbols,
                errors=r.errors,
                success_count=success_count,
                skip_count=skip_count,
            ))
        return out
    finally:
        db.close()


class SkipItem(BaseModel):
    symbol: str
    reason: str
    detail: Optional[str]
    created_at: str


@router.get("/api/tech/skips/{job_id}", response_model=List[SkipItem])
async def list_job_skips(job_id: int, reason: Optional[str] = None, limit: int = 1000, offset: int = 0):
    db = SessionLocal()
    try:
        q = db.query(TechJobSkip).filter(TechJobSkip.tech_job_id == job_id).order_by(TechJobSkip.id.asc())
        if reason:
            q = q.filter(TechJobSkip.reason == reason)
        rows = q.offset(max(0, offset)).limit(min(5000, max(1, limit))).all()
        def _iso_utc(dt: Optional[datetime]) -> str:
            if not dt:
                return ''
            try:
                if dt.tzinfo is None:
                    return dt.replace(tzinfo=timezone.utc).isoformat()
                return dt.astimezone(timezone.utc).isoformat()
            except Exception:
                return dt.isoformat()
        return [
            SkipItem(symbol=r.symbol, reason=r.reason, detail=r.detail, created_at=_iso_utc(r.created_at))
            for r in rows
        ]
    finally:
        db.close()


class SuccessItem(BaseModel):
    symbol: str
    date: str
    created_at: str


@router.get("/api/tech/success/{job_id}", response_model=List[SuccessItem])
async def list_job_success(job_id: int, limit: int = 2000, offset: int = 0):
    db = SessionLocal()
    try:
        rows = db.query(TechJobSuccess).filter(TechJobSuccess.tech_job_id == job_id).order_by(TechJobSuccess.id.asc()).offset(max(0, offset)).limit(min(10000, max(1, limit))).all()
        def _iso_utc(dt: Optional[datetime]) -> str:
            if not dt:
                return ''
            try:
                if dt.tzinfo is None:
                    return dt.replace(tzinfo=timezone.utc).isoformat()
                return dt.astimezone(timezone.utc).isoformat()
            except Exception:
                return dt.isoformat()
        return [
            SuccessItem(symbol=r.symbol, date=r.date, created_at=_iso_utc(r.created_at))
            for r in rows
        ]
    finally:
        db.close()


class ErrorItem(BaseModel):
    symbol: Optional[str]
    error_message: str
    occurred_at: str


@router.get("/api/tech/errors/{job_id}", response_model=List[ErrorItem])
async def list_job_errors(job_id: int, limit: int = 1000, offset: int = 0):
    db = SessionLocal()
    try:
        from src.db.models import TechJobError
        rows = db.query(TechJobError).filter(TechJobError.tech_job_id == job_id).order_by(TechJobError.id.asc()).offset(max(0, offset)).limit(min(10000, max(1, limit))).all()
        def _iso_utc(dt: Optional[datetime]) -> str:
            if not dt:
                return ''
            try:
                if dt.tzinfo is None:
                    return dt.replace(tzinfo=timezone.utc).isoformat()
                return dt.astimezone(timezone.utc).isoformat()
            except Exception:
                return dt.isoformat()
        return [
            ErrorItem(symbol=getattr(r, 'symbol', None), error_message=r.error_message, occurred_at=_iso_utc(getattr(r, 'occurred_at', None)))
            for r in rows
        ]
    finally:
        db.close()
