#!/usr/bin/env python3
"""
Clean up stuck jobs that are marked as 'running' but are no longer active
"""
from datetime import datetime, timezone
from sqlalchemy import create_engine, text
from app.core.config import DATABASE_URL

def cleanup_stuck_jobs():
    """Mark stuck jobs as failed"""
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        # Mark stuck EOD scans as failed
        try:
            print("Checking for stuck EOD scans...")
            result = conn.execute(text("""
                UPDATE eod_scans
                SET status = 'failed', completed_at = :now
                WHERE status = 'running' AND completed_at IS NULL
                RETURNING id, scan_date, started_at
            """), {"now": datetime.now(timezone.utc)})

            updated_scans = result.fetchall()
            conn.commit()

            if updated_scans:
                print(f"✅ Marked {len(updated_scans)} stuck EOD scans as failed:")
                for scan_id, scan_date, started_at in updated_scans:
                    print(f"  - Scan #{scan_id} (date: {scan_date}, started: {started_at})")
            else:
                print("✅ No stuck EOD scans found")

        except Exception as e:
            print(f"❌ Error cleaning up EOD scans: {e}")

        # Mark stuck job execution statuses as failed
        try:
            print("Checking for stuck job execution statuses...")
            result = conn.execute(text("""
                UPDATE job_execution_status
                SET status = 'failed'
                WHERE status = 'running' AND completed_at IS NULL
                RETURNING id, job_name, started_at
            """))

            updated_jobs = result.fetchall()
            conn.commit()

            if updated_jobs:
                print(f"✅ Marked {len(updated_jobs)} stuck job execution statuses as failed:")
                for job_id, job_name, started_at in updated_jobs:
                    print(f"  - Job #{job_id} ({job_name}, started: {started_at})")
            else:
                print("✅ No stuck job execution statuses found")

        except Exception as e:
            print(f"❌ Error cleaning up job execution statuses: {e}")

if __name__ == "__main__":
    cleanup_stuck_jobs()