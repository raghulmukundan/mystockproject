"""
TTL cleanup job for old records
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.core.config import TTL_CLEANUP_DAYS
from app.services.job_status import begin_job, complete_job, fail_job, prune_history

logger = logging.getLogger(__name__)

def cleanup_old_job_records():
    """Clean up old job execution records"""
    job_name = "job_ttl_cleanup"
    job_id = None
    try:
        logger.info("Starting TTL cleanup job")
        job_id = begin_job(job_name)
        
        # Calculate cutoff date
        cutoff_date = datetime.utcnow() - timedelta(days=TTL_CLEANUP_DAYS)
        
        db = next(get_db())
        try:
            # Delete old job execution status records
            result = db.execute(
                text("DELETE FROM job_execution_status WHERE started_at < :cutoff_date"),
                {"cutoff_date": cutoff_date}
            )
            deleted_count = result.rowcount
            db.commit()
            
            complete_job(job_id, records_processed=deleted_count)
            prune_history(job_name, keep=5)
            
            logger.info(f"TTL cleanup completed: {deleted_count} old records removed")
            
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"TTL cleanup failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise