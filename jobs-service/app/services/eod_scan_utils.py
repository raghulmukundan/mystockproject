"""
EOD scan utility functions
"""
import logging
from datetime import datetime
from sqlalchemy import desc
from app.core.database import SessionLocal
from app.db.models import EodScan, EodScanError

logger = logging.getLogger(__name__)

def prune_eod_scans(keep: int = 5):
    """Keep only the last N EOD scans and their related errors"""
    db = SessionLocal()
    try:
        # Get all scans ordered by started_at descending
        all_scans = db.query(EodScan).order_by(desc(EodScan.started_at)).all()

        if len(all_scans) <= keep:
            logger.info(f"Found {len(all_scans)} EOD scans, keeping all (limit is {keep})")
            return

        # Get IDs of scans to delete (everything beyond the keep limit)
        scans_to_delete = all_scans[keep:]
        scan_ids_to_delete = [scan.id for scan in scans_to_delete]

        logger.info(f"Pruning {len(scans_to_delete)} old EOD scans (keeping {keep} most recent)")

        # Delete related errors first
        error_count = db.query(EodScanError).filter(
            EodScanError.eod_scan_id.in_(scan_ids_to_delete)
        ).count()

        db.query(EodScanError).filter(
            EodScanError.eod_scan_id.in_(scan_ids_to_delete)
        ).delete(synchronize_session=False)

        # Delete the scans
        db.query(EodScan).filter(
            EodScan.id.in_(scan_ids_to_delete)
        ).delete(synchronize_session=False)

        db.commit()

        logger.info(f"Pruned {len(scans_to_delete)} EOD scans and {error_count} related errors")

    except Exception as e:
        logger.error(f"Error pruning EOD scans: {e}")
        db.rollback()
        raise
    finally:
        db.close()