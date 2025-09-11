from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.services.market_data import update_market_data
from app.core.config import TIMEZONE
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

# Configure scheduler with sensible defaults
scheduler = BackgroundScheduler(
    job_defaults={
        "coalesce": True,              # If multiple runs were missed, coalesce into one
        "misfire_grace_time": 300,     # Run if missed by <= 5 minutes
        "max_instances": 1,            # Prevent overlapping runs
    },
    timezone=ZoneInfo(TIMEZONE) if ZoneInfo is not None else TIMEZONE,
)

# Market data updates every 30 minutes (actual market-hours check happens inside the job)
scheduler.add_job(
    func=update_market_data,
    trigger=IntervalTrigger(minutes=30),
    id="update_market_data",
    name="Update market data every 30 minutes",
    replace_existing=True,
)

# NASDAQ universe refresh every Sunday at 8 AM
def refresh_nasdaq_universe():
    """Refresh NASDAQ universe data"""
    try:
        from app.api.universe import universe_service
        print("Starting scheduled NASDAQ universe refresh...")
        result = universe_service.refresh_symbols(download=True)
        print(f"Universe refresh completed: {result}")
    except Exception as e:
        print(f"Error during universe refresh: {e}")

scheduler.add_job(
    func=refresh_nasdaq_universe,
    trigger=CronTrigger(day_of_week='sun', hour=8, minute=0),  # Sunday 8 AM
    id="refresh_universe",
    name="Refresh NASDAQ universe every Sunday at 8 AM",
    replace_existing=True,
)
