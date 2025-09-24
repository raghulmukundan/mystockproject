"""
Initialize job configurations in the database
"""
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.db.models import JobConfiguration
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

def init_job_configurations():
    """Initialize the default job configurations"""
    db = next(get_db())

    try:
        # Check if jobs already exist
        existing_count = db.query(JobConfiguration).count()
        if existing_count > 0:
            logger.info(f"Jobs already exist in database ({existing_count} found). Skipping initialization.")
            return

        jobs_to_create = [
            {
                "job_name": "universe_refresh",
                "description": "Refresh NASDAQ universe data from nasdaqtraded.txt",
                "enabled": True,
                "schedule_type": "cron",
                "interval_value": None,
                "interval_unit": None,
                "cron_day_of_week": "sun",
                "cron_hour": 8,
                "cron_minute": 0,
                "only_market_hours": False,
                "market_start_hour": 9,
                "market_end_hour": 16
            },
            {
                "job_name": "eod_scan",
                "description": "End-of-day price and volume scan",
                "enabled": True,
                "schedule_type": "cron",
                "interval_value": None,
                "interval_unit": None,
                "cron_day_of_week": "mon,tue,wed,thu,fri",
                "cron_hour": 17,
                "cron_minute": 30,
                "only_market_hours": False,
                "market_start_hour": 9,
                "market_end_hour": 16
            },
            {
                "job_name": "market_data_refresh",
                "description": "Real-time market data refresh",
                "enabled": True,
                "schedule_type": "interval",
                "interval_value": 30,
                "interval_unit": "minutes",
                "cron_day_of_week": None,
                "cron_hour": None,
                "cron_minute": None,
                "only_market_hours": True,
                "market_start_hour": 9,
                "market_end_hour": 16
            },
            {
                "job_name": "tech_analysis",
                "description": "Technical analysis computation",
                "enabled": True,
                "schedule_type": "cron",
                "interval_value": None,
                "interval_unit": None,
                "cron_day_of_week": "mon,tue,wed,thu,fri",
                "cron_hour": 18,
                "cron_minute": 0,
                "only_market_hours": False,
                "market_start_hour": 9,
                "market_end_hour": 16
            }
        ]

        created_jobs = []
        for job_data in jobs_to_create:
            job = JobConfiguration(**job_data)
            db.add(job)
            created_jobs.append(job_data["job_name"])

        db.commit()
        logger.info(f"Successfully created {len(created_jobs)} job configurations: {', '.join(created_jobs)}")

    except Exception as e:
        logger.error(f"Error initializing job configurations: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_job_configurations()