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
    """Clean up old job execution records - retain latest 5 runs for each job type"""
    job_name = "job_ttl_cleanup"
    job_id = None
    try:
        logger.info("Starting TTL cleanup job")
        job_id = begin_job(job_name)

        db = next(get_db())
        try:
            # Get all distinct job names
            job_names_result = db.execute(
                text("SELECT DISTINCT job_name FROM job_execution_status")
            )
            job_names = [row[0] for row in job_names_result.fetchall()]

            total_deleted = 0

            # For each job type, keep only the latest 5 runs
            for job_type in job_names:
                logger.info(f"Cleaning up job type: {job_type}")

                # Delete all but the latest 5 records for this job type
                result = db.execute(
                    text("""
                        DELETE FROM job_execution_status
                        WHERE job_name = :job_name
                        AND id NOT IN (
                            SELECT id FROM job_execution_status
                            WHERE job_name = :job_name
                            ORDER BY started_at DESC
                            LIMIT 5
                        )
                    """),
                    {"job_name": job_type}
                )
                deleted_for_job = result.rowcount
                total_deleted += deleted_for_job

                if deleted_for_job > 0:
                    logger.info(f"Deleted {deleted_for_job} old records for job: {job_type}")

            # Clean up all other job-related tables - keep latest 5 records for each

            # Clean up EOD scans - keep only latest 5 by ID (using parameterized queries)
            logger.info("Cleaning up old EOD scan records")

            # Get all EOD scan IDs ordered by ID desc
            eod_ids_result = db.execute(text("SELECT id FROM eod_scans ORDER BY id DESC"))
            all_eod_ids = [row[0] for row in eod_ids_result.fetchall()]

            if len(all_eod_ids) > 5:
                # Keep the first 5 (highest IDs), delete the rest
                ids_to_keep = all_eod_ids[:5]
                ids_to_delete = all_eod_ids[5:]

                logger.info(f"Found {len(all_eod_ids)} EOD scans. Keeping IDs: {ids_to_keep}. Deleting IDs: {ids_to_delete}")

                if ids_to_delete:
                    # Delete EOD scan errors first - delete them one by one to avoid SQL issues
                    eod_errors_deleted = 0
                    for scan_id in ids_to_delete:
                        result = db.execute(
                            text("DELETE FROM eod_scan_errors WHERE eod_scan_id = :scan_id"),
                            {"scan_id": scan_id}
                        )
                        eod_errors_deleted += result.rowcount

                    total_deleted += eod_errors_deleted
                    if eod_errors_deleted > 0:
                        logger.info(f"Deleted {eod_errors_deleted} old EOD scan error records")

                    # Then delete the EOD scans - delete them one by one
                    eod_deleted = 0
                    for scan_id in ids_to_delete:
                        result = db.execute(
                            text("DELETE FROM eod_scans WHERE id = :scan_id"),
                            {"scan_id": scan_id}
                        )
                        eod_deleted += result.rowcount
                        if result.rowcount > 0:
                            logger.info(f"Deleted EOD scan with ID: {scan_id}")

                    total_deleted += eod_deleted
                    logger.info(f"Deleted {eod_deleted} old EOD scan records")

                    # Commit immediately to ensure deletion is persisted
                    db.commit()
                    logger.info("EOD scan deletion committed to database")

                    # Verify deletion worked
                    remaining_result = db.execute(text("SELECT COUNT(*) FROM eod_scans"))
                    remaining_count = remaining_result.scalar()
                    logger.info(f"EOD scans remaining after cleanup: {remaining_count}")

                    # Also log the remaining IDs for verification
                    remaining_ids_result = db.execute(text("SELECT id FROM eod_scans ORDER BY id DESC"))
                    remaining_ids = [row[0] for row in remaining_ids_result.fetchall()]
                    logger.info(f"Remaining EOD scan IDs: {remaining_ids}")
            else:
                logger.info(f"Only {len(all_eod_ids)} EOD scans found - no cleanup needed")

            # Technical analysis job records (if they exist in separate table)
            try:
                logger.info("Cleaning up old technical analysis records")
                tech_result = db.execute(
                    text("""
                        DELETE FROM technical_job_runs
                        WHERE id NOT IN (
                            SELECT id FROM technical_job_runs
                            ORDER BY started_at DESC
                            LIMIT 5
                        )
                    """)
                )
                tech_deleted = tech_result.rowcount
                total_deleted += tech_deleted
                if tech_deleted > 0:
                    logger.info(f"Deleted {tech_deleted} old technical analysis job records")
            except Exception as e:
                # Table might not exist, that's okay
                logger.debug(f"Technical analysis job table not found or error: {e}")

            # Any other job-related tables can be added here following the same pattern

            db.commit()

            complete_job(job_id, records_processed=total_deleted)
            prune_history(job_name, keep=5)

            logger.info(f"TTL cleanup completed: {total_deleted} old records removed across all job types")

        finally:
            db.close()

    except Exception as e:
        logger.error(f"TTL cleanup failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise