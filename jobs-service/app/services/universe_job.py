"""
Universe refresh job
"""
import asyncio
import logging
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.external_client import backend_client

logger = logging.getLogger(__name__)

def refresh_universe_job():
    """Universe refresh job wrapper"""
    asyncio.run(_refresh_universe_job())

async def _refresh_universe_job():
    """Refresh NASDAQ universe data"""
    job_name = "nasdaq_universe_refresh"
    job_id = None
    try:
        logger.info("Starting NASDAQ universe refresh job")
        job_id = begin_job(job_name)
        
        # Call external APIs service to refresh universe
        result = await backend_client.refresh_universe()
        
        # Extract records processed from result
        records_processed = result.get('total', 0)
        
        complete_job(job_id, records_processed=records_processed)
        prune_history(job_name, keep=5)

        logger.info(f"Universe refresh completed: {records_processed} symbols processed")

        # Trigger weekly bars ETL after universe refresh (Friday only)
        from datetime import datetime
        import pytz
        chicago_tz = pytz.timezone('America/Chicago')
        now = datetime.now(chicago_tz)

        if now.weekday() == 4:  # Friday
            logger.info("🔗 CHAINING: Triggering weekly_bars_etl after universe refresh (Friday)")
            from app.services.weekly_bars_job import run_weekly_bars_job
            try:
                await run_weekly_bars_job()
                logger.info("✅ CHAINING: weekly_bars_etl completed successfully")
            except Exception as chain_error:
                logger.error(f"❌ CHAINING: weekly_bars_etl failed: {str(chain_error)}")
        else:
            logger.info(f"⏭️  CHAINING: Skipping weekly_bars_etl (not Friday, today is {now.strftime('%A')})")

    except Exception as e:
        logger.error(f"Universe refresh failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise