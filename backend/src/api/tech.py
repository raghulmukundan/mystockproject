from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from typing import List, Optional
import time
import threading

from src.db.models import SessionLocal, TechJob
from src.services.tech.run import run_technical_compute
from src.services.tech.fetch_prices import get_latest_trade_date
from app.services.job_status import begin_job, complete_job, fail_job, prune_history


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
            processed = int(result.get('daily_rows_upserted', 0)) + int(result.get('latest_rows_upserted', 0))
            complete_job(job_id, records_processed=processed)
        except Exception as e:
            fail_job(job_id, str(e))
        finally:
            prune_history(job_name, keep=5)

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
