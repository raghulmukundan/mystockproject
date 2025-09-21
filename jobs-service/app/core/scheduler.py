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
from app.services.tech_job import run_tech_job
from app.services.ttl_cleanup_job import cleanup_old_job_records
import logging

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

logger = logging.getLogger(__name__)

# Configure scheduler with sensible defaults
scheduler = BackgroundScheduler(
    job_defaults={
        "coalesce": True,              # If multiple runs were missed, coalesce into one
        "misfire_grace_time": 300,     # Run if missed by <= 5 minutes
        "max_instances": 1,            # Prevent overlapping runs
    },
    timezone=ZoneInfo(TIMEZONE) if ZoneInfo is not None else TIMEZONE,
)

def setup_jobs():
    """Setup all scheduled jobs"""
    
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
    scheduler.add_job(
        func=run_eod_scan_job,
        trigger=CronTrigger(day_of_week='mon-fri', hour=17, minute=30),
        id="eod_price_scan",
        name="EOD price scan at 5:30 PM",
        replace_existing=True,
    )
    
    # TTL cleanup job daily at 3:00 AM
    scheduler.add_job(
        func=cleanup_old_job_records,
        trigger=CronTrigger(hour=3, minute=0),
        id="job_ttl_cleanup",
        name="Cleanup old job records",
        replace_existing=True,
    )
    
    logger.info("All scheduled jobs configured successfully")

# Setup jobs when module is imported
setup_jobs()