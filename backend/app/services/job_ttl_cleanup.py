from datetime import datetime, timedelta
from sqlalchemy import text
from app.core.database import get_db


def cleanup_old_job_records(days: int = 5) -> dict:
    """Delete job-related records older than N days.

    Applies to:
      - import_jobs, import_errors, processed_files
      - eod_scans, eod_scan_errors
    """
    db = next(get_db())
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        params = {"cutoff": cutoff}
        results = {}

        # Import errors by occurred_at
        res = db.execute(text("DELETE FROM import_errors WHERE occurred_at < :cutoff"), params)
        results["import_errors_deleted"] = res.rowcount if hasattr(res, 'rowcount') else 0

        # Processed files by processing_end (fallback to processing_start)
        res = db.execute(text("DELETE FROM processed_files WHERE COALESCE(processing_end, processing_start) < :cutoff"), params)
        results["processed_files_deleted"] = res.rowcount if hasattr(res, 'rowcount') else 0

        # Import jobs by started_at
        res = db.execute(text("DELETE FROM import_jobs WHERE started_at < :cutoff"), params)
        results["import_jobs_deleted"] = res.rowcount if hasattr(res, 'rowcount') else 0

        # EOD scan errors older than cutoff (by occurred_at)
        res1 = db.execute(text("DELETE FROM eod_scan_errors WHERE occurred_at < :cutoff"), params)
        deleted_errs_by_time = res1.rowcount if hasattr(res1, 'rowcount') else 0

        # Additionally, delete errors tied to scans older than cutoff (by scan started_at)
        res2 = db.execute(text("""
            DELETE FROM eod_scan_errors 
            WHERE eod_scan_id IN (
                SELECT id FROM eod_scans WHERE started_at < :cutoff
            )
        """), params)
        deleted_errs_by_scan = res2.rowcount if hasattr(res2, 'rowcount') else 0
        results["eod_scan_errors_deleted"] = (deleted_errs_by_time or 0) + (deleted_errs_by_scan or 0)

        # EOD scans by started_at
        res3 = db.execute(text("DELETE FROM eod_scans WHERE started_at < :cutoff"), params)
        results["eod_scans_deleted"] = res3.rowcount if hasattr(res3, 'rowcount') else 0

        db.commit()
        return results
    finally:
        db.close()
