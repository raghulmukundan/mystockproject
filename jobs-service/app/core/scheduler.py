"""
Job scheduler for the Jobs Service
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.core.config import TIMEZONE
from app.core.database import get_db
from app.db.models import JobConfiguration
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.market_data_job import update_market_data_job
from app.services.eod_scan_job import run_eod_scan_job
from app.services.universe_job import refresh_universe_job
from app.services.tech_job import run_tech_job
from app.services.ttl_cleanup_job import cleanup_old_job_records
import logging
from datetime import datetime, time
from pytz import timezone as pytz_timezone

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

# Job function mapping
JOB_FUNCTIONS = {
    "market_data_refresh": update_market_data_job,
    "universe_refresh": refresh_universe_job,
    "eod_scan": run_eod_scan_job,
    "tech_analysis": run_tech_job,  # Note: This runs automatically after EOD scan
}

def is_market_hours():
    """Check if current time is within market hours (9 AM - 4 PM CST)"""
    try:
        cst = pytz_timezone('America/Chicago')
        now = datetime.now(cst)
        current_time = now.time()

        # Check if it's a weekday (0=Monday, 6=Sunday)
        if now.weekday() >= 5:  # Saturday=5, Sunday=6
            return False

        # Market hours: 9 AM to 4 PM CST
        market_open = time(9, 0)
        market_close = time(16, 0)

        return market_open <= current_time <= market_close
    except Exception:
        # If timezone handling fails, assume market is open to be safe
        return True

def create_market_hours_trigger(interval_minutes):
    """Create a trigger that only runs during market hours"""
    class MarketHoursTrigger:
        def __init__(self, interval_minutes):
            self.interval_trigger = IntervalTrigger(minutes=interval_minutes)

        def get_next_fire_time(self, previous_fire_time, now):
            # Get next time from interval trigger
            next_time = self.interval_trigger.get_next_fire_time(previous_fire_time, now)

            if next_time and is_market_hours():
                return next_time
            else:
                # Skip this execution, return next possible time
                return self.interval_trigger.get_next_fire_time(next_time, now)

    return MarketHoursTrigger(interval_minutes)

def setup_jobs_from_database():
    """Setup jobs from database configurations"""
    try:
        db = next(get_db())
        job_configs = db.query(JobConfiguration).filter(JobConfiguration.enabled == True).all()

        for config in job_configs:
            if config.job_name not in JOB_FUNCTIONS:
                logger.warning(f"No function found for job: {config.job_name}")
                continue

            job_func = JOB_FUNCTIONS[config.job_name]

            # Create appropriate trigger based on schedule type
            if config.schedule_type == "interval":
                if config.only_market_hours:
                    # For market hours only, we'll use a custom wrapper
                    def market_hours_wrapper(func=job_func):
                        if is_market_hours():
                            return func()
                        else:
                            logger.info(f"Skipping {config.job_name} - outside market hours")

                    trigger = IntervalTrigger(minutes=config.interval_value)
                    scheduler.add_job(
                        func=market_hours_wrapper,
                        trigger=trigger,
                        id=config.job_name,
                        name=f"{config.description} (market hours only)",
                        replace_existing=True,
                    )
                else:
                    trigger = IntervalTrigger(**{config.interval_unit: config.interval_value})
                    scheduler.add_job(
                        func=job_func,
                        trigger=trigger,
                        id=config.job_name,
                        name=config.description,
                        replace_existing=True,
                    )

            elif config.schedule_type == "cron":
                trigger_kwargs = {}
                if config.cron_day_of_week:
                    trigger_kwargs["day_of_week"] = config.cron_day_of_week
                if config.cron_hour is not None:
                    trigger_kwargs["hour"] = config.cron_hour
                if config.cron_minute is not None:
                    trigger_kwargs["minute"] = config.cron_minute

                trigger = CronTrigger(**trigger_kwargs)
                scheduler.add_job(
                    func=job_func,
                    trigger=trigger,
                    id=config.job_name,
                    name=config.description,
                    replace_existing=True,
                )

            logger.info(f"Configured job: {config.job_name} - {config.description}")

        # Always add TTL cleanup job (not in database)
        scheduler.add_job(
            func=cleanup_old_job_records,
            trigger=CronTrigger(hour=3, minute=0),
            id="job_ttl_cleanup",
            name="Cleanup old job records",
            replace_existing=True,
        )

        logger.info(f"Successfully configured {len(job_configs)} jobs from database")

    except Exception as e:
        logger.error(f"Error setting up jobs from database: {e}")
        # Fallback to hardcoded jobs if database fails
        setup_fallback_jobs()
    finally:
        if 'db' in locals():
            db.close()

def setup_fallback_jobs():
    """Fallback job setup if database is unavailable"""
    logger.warning("Using fallback job configuration")

    # Market data updates every 30 minutes (market hours only)
    def market_data_wrapper():
        if is_market_hours():
            return update_market_data_job()
        else:
            logger.info("Skipping market data refresh - outside market hours")

    scheduler.add_job(
        func=market_data_wrapper,
        trigger=IntervalTrigger(minutes=30),
        id="market_data_refresh",
        name="Update market data every 30 minutes (market hours only)",
        replace_existing=True,
    )

    # NASDAQ universe refresh every Sunday at 8 AM
    scheduler.add_job(
        func=refresh_universe_job,
        trigger=CronTrigger(day_of_week='sun', hour=8, minute=0),
        id="universe_refresh",
        name="Refresh NASDAQ universe every Sunday at 8 AM",
        replace_existing=True,
    )

    # EOD daily OHLC scan at 5:30 PM America/Chicago (Mon–Fri)
    scheduler.add_job(
        func=run_eod_scan_job,
        trigger=CronTrigger(day_of_week='mon-fri', hour=17, minute=30),
        id="eod_scan",
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

def reload_jobs():
    """Reload jobs from database (useful for runtime updates)"""
    logger.info("Reloading jobs from database...")

    # Remove existing jobs
    for job in scheduler.get_jobs():
        scheduler.remove_job(job.id)

    # Reload from database
    setup_jobs_from_database()

# Setup jobs when module is imported
setup_jobs_from_database()