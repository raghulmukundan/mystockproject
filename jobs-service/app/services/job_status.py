"""
Job status tracking service
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.db.models import JobExecutionStatus


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
    """Mark job as completed with processing stats"""
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
    """Mark job as failed with error message"""
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


def get_job_latest_status(job_name: str) -> Optional[JobExecutionStatus]:
    """Get the latest status for a job"""
    db = next(get_db())
    try:
        return db.query(JobExecutionStatus).filter(
            JobExecutionStatus.job_name == job_name
        ).order_by(JobExecutionStatus.started_at.desc()).first()
    finally:
        db.close()


def get_job_history(job_name: str, limit: int = 10) -> list[JobExecutionStatus]:
    """Get job execution history"""
    db = next(get_db())
    try:
        return db.query(JobExecutionStatus).filter(
            JobExecutionStatus.job_name == job_name
        ).order_by(JobExecutionStatus.started_at.desc()).limit(limit).all()
    finally:
        db.close()