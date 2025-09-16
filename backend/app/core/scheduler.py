from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.services.market_data import update_market_data
from app.services.eod_scan import run_eod_scan_all_symbols
from app.services.job_ttl_cleanup import cleanup_old_job_records
from app.core.config import TIMEZONE
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from src.services.tech.run import run_technical_compute
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

def update_market_data_job():
    job_name = "market_data_refresh"
    job_id = None
    try:
        job_id = begin_job(job_name)
        update_market_data()
        complete_job(job_id, records_processed=0)
        prune_history(job_name, keep=5)
    except Exception as e:
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)

# Market data updates every 30 minutes (actual market-hours check happens inside the job)
scheduler.add_job(
    func=update_market_data_job,
    trigger=IntervalTrigger(minutes=30),
    id="update_market_data",
    name="Update market data every 30 minutes",
    replace_existing=True,
)

# NASDAQ universe refresh every Sunday at 8 AM
def refresh_nasdaq_universe():
    """Refresh NASDAQ universe data"""
    job_name = "nasdaq_universe_refresh"
    job_id = None
    try:
        from app.api.universe import universe_service
        print("Starting scheduled NASDAQ universe refresh...")
        job_id = begin_job(job_name)
        result = universe_service.refresh_symbols(download=True)
        complete_job(job_id, records_processed=result.get('total', 0))
        prune_history(job_name, keep=5)
        print(f"Universe refresh completed: {result}")
    except Exception as e:
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        print(f"Error during universe refresh: {e}")

scheduler.add_job(
    func=refresh_nasdaq_universe,
    trigger=CronTrigger(day_of_week='sun', hour=8, minute=0),  # Sunday 8 AM
    id="refresh_universe",
    name="Refresh NASDAQ universe every Sunday at 8 AM",
    replace_existing=True,
)

# EOD daily OHLC scan at 5:30 PM America/Chicago (Mon–Fri)
def eod_price_scan_job():
    job_name = "eod_price_scan"
    job_id = None
    try:
        job_id = begin_job(job_name)
        result = run_eod_scan_all_symbols()
        processed = int(result.get('inserted', 0)) + int(result.get('updated', 0)) + int(result.get('skipped', 0))
        complete_job(job_id, records_processed=processed)
        prune_history(job_name, keep=5)

        # Kick off technical compute immediately after successful EOD price scan
        tech_job_name = 'technical_compute'
        tech_job_id = begin_job(tech_job_name)
        try:
            tech_result = run_technical_compute(None)
            tech_processed = int(tech_result.get('daily_rows_upserted', 0)) + int(tech_result.get('latest_rows_upserted', 0))
            complete_job(tech_job_id, records_processed=tech_processed)
        except Exception as te:
            fail_job(tech_job_id, str(te))
        finally:
            prune_history(tech_job_name, keep=5)
    except Exception as e:
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise

scheduler.add_job(
    func=eod_price_scan_job,
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
