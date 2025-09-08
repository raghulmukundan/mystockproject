from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.services.market_data import update_market_data

scheduler = BackgroundScheduler()

# Market data updates every 5 minutes
scheduler.add_job(
    func=update_market_data,
    trigger=IntervalTrigger(minutes=5),
    id="update_market_data",
    name="Update market data every 5 minutes",
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