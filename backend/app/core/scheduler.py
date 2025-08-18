from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from app.services.market_data import update_market_data

scheduler = BackgroundScheduler()

scheduler.add_job(
    func=update_market_data,
    trigger=IntervalTrigger(minutes=5),
    id="update_market_data",
    name="Update market data every 5 minutes",
    replace_existing=True,
)