"""
Job locking mechanism to prevent duplicate job runs
Uses PostgreSQL advisory locks for atomic lock acquisition
"""
from app.core.database import SessionLocal

def acquire_job_lock(job_name: str) -> bool:
    """
    Try to acquire an advisory lock for a job.
    Returns True if lock was acquired, False if already locked.
    Uses PostgreSQL's pg_try_advisory_lock which is atomic.
    """
    # Convert job name to a unique integer for advisory lock
    lock_id = hash(job_name) % (2**31)  # Ensure it fits in 32-bit integer

    db = SessionLocal()
    try:
        result = db.execute(
            "SELECT pg_try_advisory_lock(:lock_id)",
            {"lock_id": lock_id}
        ).scalar()
        return result is True
    finally:
        db.close()

def release_job_lock(job_name: str):
    """
    Release the advisory lock for a job.
    """
    lock_id = hash(job_name) % (2**31)

    db = SessionLocal()
    try:
        db.execute(
            "SELECT pg_advisory_unlock(:lock_id)",
            {"lock_id": lock_id}
        )
    finally:
        db.close()
