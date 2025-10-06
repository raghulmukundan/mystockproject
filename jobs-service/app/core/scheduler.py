"""
Job scheduler for the Jobs Service
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.core.config import TIMEZONE
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.market_data_job import update_market_data_job
from app.services.eod_scan_job import run_eod_scan_job
from app.services.universe_job import refresh_universe_job
from app.services.tech_job import run_tech_job_scheduled
from app.services.ttl_cleanup_job import cleanup_old_job_records
from app.services.token_validation_job import validate_schwab_token_job
from app.services.daily_movers_job import run_daily_movers_job_scheduled
from app.services.asset_metadata_enrichment_job import run_asset_metadata_enrichment_job_scheduled
from app.core.database import SessionLocal
from app.db.models import JobConfiguration
import logging

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

logger = logging.getLogger(__name__)

# Technical analysis fallback function removed - no longer needed since EOD scan triggers it automatically

# Configure scheduler with sensible defaults
scheduler = BackgroundScheduler(
    job_defaults={
        "coalesce": True,              # If multiple runs were missed, coalesce into one
        "misfire_grace_time": 300,     # Run if missed by <= 5 minutes
        "max_instances": 1,            # Prevent overlapping runs
    },
    timezone=ZoneInfo(TIMEZONE) if ZoneInfo is not None else TIMEZONE,
)

def setup_job_configurations():
    """Setup job configurations in database"""
    db = SessionLocal()
    try:
        job_configs = [
            {
                "job_name": "update_market_data",
                "description": "Update market data every 30 minutes",
                "enabled": True,
                "schedule_type": "interval",
                "interval_value": 30,
                "interval_unit": "minutes",
                "only_market_hours": True,
                "market_start_hour": 9,
                "market_end_hour": 16
            },
            {
                "job_name": "nasdaq_universe_refresh",
                "description": "Refresh NASDAQ universe every Sunday at 8 AM",
                "enabled": True,
                "schedule_type": "cron",
                "cron_day_of_week": "sun",
                "cron_hour": 8,
                "cron_minute": 0,
                "only_market_hours": False
            },
            {
                "job_name": "eod_price_scan",
                "description": "EOD price scan at 5:30 PM",
                "enabled": True,
                "schedule_type": "cron",
                "cron_day_of_week": "mon-fri",
                "cron_hour": 17,
                "cron_minute": 30,
                "only_market_hours": False
            },
            {
                "job_name": "job_ttl_cleanup",
                "description": "Cleanup old job records",
                "enabled": True,
                "schedule_type": "cron",
                "cron_day_of_week": None,
                "cron_hour": 3,
                "cron_minute": 0,
                "only_market_hours": False
            },
            {
                "job_name": "schwab_token_validation",
                "description": "Validate Schwab token status every 12 hours",
                "enabled": True,
                "schedule_type": "interval",
                "interval_value": 12,
                "interval_unit": "hours",
                "only_market_hours": False
            },
            {
                "job_name": "daily_movers_calculation",
                "description": "Calculate daily top movers by sector and market cap after tech analysis",
                "enabled": True,
                "schedule_type": "cron",
                "cron_day_of_week": "mon-fri",
                "cron_hour": 18,
                "cron_minute": 30,
                "only_market_hours": False
            }
        ]

        for config in job_configs:
            existing = db.query(JobConfiguration).filter(
                JobConfiguration.job_name == config["job_name"]
            ).first()

            if not existing:
                job_config = JobConfiguration(**config)
                db.add(job_config)
                logger.info(f"Created job configuration: {config['job_name']}")

        db.commit()
        logger.info("Job configurations initialized successfully")
    except Exception as e:
        logger.error(f"Error setting up job configurations: {e}")
        db.rollback()
    finally:
        db.close()

def setup_jobs():
    """Setup all scheduled jobs"""

    # Initialize database job configurations first
    setup_job_configurations()

    # Market data updates every 30 minutes
    scheduler.add_job(
        func=update_market_data_job,
        trigger=IntervalTrigger(minutes=30),
        id="update_market_data",
        name="Update market data every 30 minutes",
        replace_existing=True,
    )

    # NASDAQ universe refresh every Sunday at 8 AM
    scheduler.add_job(
        func=refresh_universe_job,
        trigger=CronTrigger(day_of_week='sun', hour=8, minute=0),
        id="refresh_universe",
        name="Refresh NASDAQ universe every Sunday at 8 AM",
        replace_existing=True,
    )

    # EOD daily OHLC scan at 5:30 PM America/Chicago (Mon–Fri)
    # Override max_instances for EOD job to allow multiple runs per day
    scheduler.add_job(
        func=run_eod_scan_job,
        trigger=CronTrigger(day_of_week='mon-fri', hour=17, minute=30),
        id="eod_price_scan",
        name="EOD price scan at 5:30 PM",
        replace_existing=True,
        max_instances=2,  # Allow scheduled run even if manual run occurred earlier
    )

    # Technical analysis fallback removed - EOD scan already triggers technical analysis automatically

    # TTL cleanup job daily at 3:00 AM
    scheduler.add_job(
        func=cleanup_old_job_records,
        trigger=CronTrigger(hour=3, minute=0),
        id="job_ttl_cleanup",
        name="Cleanup old job records",
        replace_existing=True,
    )

    # Schwab token validation job every 12 hours
    scheduler.add_job(
        func=validate_schwab_token_job,
        trigger=IntervalTrigger(hours=12),
        id="schwab_token_validation",
        name="Validate Schwab token status every 12 hours",
        replace_existing=True,
    )

    # Daily movers calculation after market close and tech analysis
    scheduler.add_job(
        func=run_daily_movers_job_scheduled,
        trigger=CronTrigger(day_of_week="mon-fri", hour=18, minute=30),
        id="daily_movers_calculation",
        name="Calculate daily top movers by sector and market cap",
        replace_existing=True,
    )

    logger.info("All scheduled jobs configured successfully")

# Setup jobs when module is imported
setup_jobs()