from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from src.db.models import JobExecutionStatus
from src.db.models import EodScan, EodScanError
from src.db.models import TechJob
from src.db.models import TechJobSkip, TechJobSuccess


def begin_job(job_name: str, next_run_at: Optional[datetime] = None) -> int:
    """Insert a running JobExecutionStatus row and return its id."""
    db = next(get_db())
    try:
        row = JobExecutionStatus(
            job_name=job_name,
            status='running',
            started_at=datetime.utcnow(),
            next_run_at=next_run_at,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id
    finally:
        db.close()


def complete_job(job_id: int, records_processed: int = 0):
    db = next(get_db())
    try:
        row = db.query(JobExecutionStatus).filter(JobExecutionStatus.id == job_id).first()
        if not row:
            return
        row.status = 'completed'
        row.completed_at = datetime.utcnow()
        if row.started_at and row.completed_at:
            row.duration_seconds = int((row.completed_at - row.started_at).total_seconds())
        row.records_processed = records_processed
        db.commit()
    finally:
        db.close()


def fail_job(job_id: int, error_message: str):
    db = next(get_db())
    try:
        row = db.query(JobExecutionStatus).filter(JobExecutionStatus.id == job_id).first()
        if not row:
            return
        row.status = 'failed'
        row.completed_at = datetime.utcnow()
        if row.started_at and row.completed_at:
            row.duration_seconds = int((row.completed_at - row.started_at).total_seconds())
        row.error_message = error_message
        db.commit()
    finally:
        db.close()


def prune_history(job_name: str, keep: int = 5):
    """Keep only the most recent N job status rows for a job."""
    keep = max(0, int(keep))
    db = next(get_db())
    try:
        # Delete rows not in the top `keep` most recent by started_at
        # Use a subquery selecting ids to keep
        db.execute(
            text(
                """
                DELETE FROM job_execution_status
                WHERE job_name = :job_name
                  AND id NOT IN (
                    SELECT id FROM job_execution_status
                    WHERE job_name = :job_name
                    ORDER BY started_at DESC
                    LIMIT :keep
                  )
                """
            ),
            {"job_name": job_name, "keep": keep},
        )
        db.commit()
    finally:
        db.close()


def prune_eod_scans(keep: int = 5):
    """Keep only the most recent N EOD scans and related errors."""
    keep = max(0, int(keep))
    db = next(get_db())
    try:
        # Collect ids to keep
        ids_to_keep = [r.id for r in db.query(EodScan.id).order_by(EodScan.started_at.desc()).limit(keep).all()]
        if not ids_to_keep:
            # Nothing to prune
            return
        # Delete errors for scans not in keep set
        db.query(EodScanError).filter(~EodScanError.eod_scan_id.in_(ids_to_keep)).delete(synchronize_session=False)
        # Delete scans not in keep set
        db.query(EodScan).filter(~EodScan.id.in_(ids_to_keep)).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def prune_tech_jobs(keep: int = 5):
    """Keep only the most recent N tech jobs and related skips/successes."""
    keep = max(0, int(keep))
    db = next(get_db())
    try:
        ids_to_keep = [r.id for r in db.query(TechJob.id).order_by(TechJob.id.desc()).limit(keep).all()]
        if not ids_to_keep:
            return
        # Delete related rows
        db.query(TechJobSkip).filter(~TechJobSkip.tech_job_id.in_(ids_to_keep)).delete(synchronize_session=False)
        db.query(TechJobSuccess).filter(~TechJobSuccess.tech_job_id.in_(ids_to_keep)).delete(synchronize_session=False)
        # Delete older jobs
        db.query(TechJob).filter(~TechJob.id.in_(ids_to_keep)).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
