"""
Configuration-driven TTL cleanup job for old records
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.core.config import TTL_CLEANUP_DAYS
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.config.job_table_mappings import JOB_TABLE_MAPPINGS, get_cleanup_order

logger = logging.getLogger(__name__)

def cleanup_job_tables_by_mapping(db: Session, job_type: str, mapping: dict, keep: int = 5) -> int:
    """
    Clean up job tables based on mapping configuration.

    Args:
        db: Database session
        job_type: Type of job (e.g., 'technical_compute')
        mapping: Job table mapping configuration
        keep: Number of records to keep (default 5)

    Returns:
        Total number of records deleted
    """
    parent_table = mapping["parent"]
    total_deleted = 0

    logger.info(f"Cleaning up {job_type} job tables (parent: {parent_table})")

    # Get all parent record IDs ordered by ID desc
    try:
        result = db.execute(text(f"SELECT id FROM {parent_table} ORDER BY id DESC"))
        all_ids = [row[0] for row in result.fetchall()]
    except Exception as e:
        logger.warning(f"Table {parent_table} not found or error querying: {e}")
        return 0

    if len(all_ids) <= keep:
        logger.info(f"Only {len(all_ids)} {parent_table} records found - no cleanup needed")
        return 0

    # Keep the first N (highest IDs), delete the rest
    ids_to_keep = all_ids[:keep]
    ids_to_delete = all_ids[keep:]

    logger.info(f"Found {len(all_ids)} {parent_table} records. Keeping IDs: {ids_to_keep}. Deleting IDs: {ids_to_delete}")

    if not ids_to_delete:
        return 0

    # Get cleanup order (children first, then parent)
    cleanup_order = get_cleanup_order(job_type)

    for table_info in cleanup_order:
        table_name = table_info["table"]
        fk_column = table_info["fk"]
        is_parent = table_info["is_parent"]

        try:
            deleted_count = 0

            if is_parent:
                # Delete parent records by ID
                for record_id in ids_to_delete:
                    result = db.execute(
                        text(f"DELETE FROM {table_name} WHERE id = :record_id"),
                        {"record_id": record_id}
                    )
                    deleted_count += result.rowcount
                    if result.rowcount > 0:
                        logger.debug(f"Deleted {table_name} record with ID: {record_id}")
            else:
                # Delete child records by foreign key
                for parent_id in ids_to_delete:
                    result = db.execute(
                        text(f"DELETE FROM {table_name} WHERE {fk_column} = :parent_id"),
                        {"parent_id": parent_id}
                    )
                    deleted_count += result.rowcount

            total_deleted += deleted_count

            if deleted_count > 0:
                logger.info(f"Deleted {deleted_count} records from {table_name}")

        except Exception as e:
            logger.warning(f"Error cleaning table {table_name}: {e}")
            continue

    # Commit after each job type
    db.commit()
    logger.info(f"Committed {job_type} cleanup: {total_deleted} total records deleted")

    # Verify cleanup
    try:
        result = db.execute(text(f"SELECT COUNT(*) FROM {parent_table}"))
        remaining_count = result.scalar()
        logger.info(f"{parent_table} records remaining after cleanup: {remaining_count}")
    except Exception:
        pass

    return total_deleted

def cleanup_general_job_execution_status(db: Session, keep: int = 5) -> int:
    """Clean up general job execution status - keep latest N per job type"""
    total_deleted = 0

    try:
        # Get all distinct job names
        job_names_result = db.execute(
            text("SELECT DISTINCT job_name FROM job_execution_status")
        )
        job_names = [row[0] for row in job_names_result.fetchall()]

        # For each job type, keep only the latest N runs
        for job_name in job_names:
            logger.info(f"Cleaning up job_execution_status for job: {job_name}")

            # Delete all but the latest N records for this job type
            result = db.execute(
                text("""
                    DELETE FROM job_execution_status
                    WHERE job_name = :job_name
                    AND id NOT IN (
                        SELECT id FROM job_execution_status
                        WHERE job_name = :job_name
                        ORDER BY started_at DESC
                        LIMIT :keep
                    )
                """),
                {"job_name": job_name, "keep": keep}
            )
            deleted_for_job = result.rowcount
            total_deleted += deleted_for_job

            if deleted_for_job > 0:
                logger.info(f"Deleted {deleted_for_job} old job_execution_status records for: {job_name}")

    except Exception as e:
        logger.error(f"Error cleaning job_execution_status: {e}")

    return total_deleted

def cleanup_old_job_records():
    """Configuration-driven cleanup of old job records - retain latest 5 runs for each job type"""
    job_name = "job_ttl_cleanup"
    job_id = None

    try:
        logger.info("Starting configuration-driven TTL cleanup job")
        job_id = begin_job(job_name)

        db = next(get_db())
        total_deleted = 0

        try:
            # Clean up job_execution_status first (general job tracking)
            logger.info("Cleaning up general job execution status")
            general_deleted = cleanup_general_job_execution_status(db, keep=5)
            total_deleted += general_deleted

            # Clean up each job type based on mappings
            for job_type, mapping in JOB_TABLE_MAPPINGS.items():
                # Skip general_jobs as it's handled above
                if job_type == "general_jobs":
                    continue

                deleted = cleanup_job_tables_by_mapping(db, job_type, mapping, keep=5)
                total_deleted += deleted

            # Final commit
            db.commit()

            complete_job(job_id, records_processed=total_deleted)
            prune_history(job_name, keep=5)

            logger.info(f"Configuration-driven TTL cleanup completed: {total_deleted} old records removed across all job types")

        finally:
            db.close()

    except Exception as e:
        logger.error(f"TTL cleanup failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise