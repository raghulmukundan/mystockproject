"""
Market data refresh job
"""
import asyncio
import logging
from datetime import datetime
import pytz
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.external_client import backend_client, external_client
from app.services.price_storage import price_storage

logger = logging.getLogger(__name__)

def update_market_data_job():
    """Market data refresh job wrapper"""
    asyncio.run(_update_market_data_job())

async def _update_market_data_job():
    """Update market data from external APIs"""
    job_name = "update_market_data"
    job_id = None
    try:
        # Check if market is open (9:30 AM - 4:00 PM CT, Mon-Fri)
        chicago_tz = pytz.timezone('America/Chicago')
        now = datetime.now(chicago_tz)

        # Skip on weekends
        if now.weekday() >= 5:  # 5 = Saturday, 6 = Sunday
            logger.info(f"Skipping market data refresh - weekend (day {now.weekday()})")
            return

        # Skip outside market hours (9:30 AM - 4:00 PM CT)
        market_open_time = now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close_time = now.replace(hour=16, minute=0, second=0, microsecond=0)

        if now < market_open_time or now >= market_close_time:
            logger.info(f"Skipping market data refresh - outside market hours (current time: {now.strftime('%H:%M:%S')})")
            return

        logger.info("Starting market data refresh job")
        job_id = begin_job(job_name)
        
        # Step 1: Get watchlist symbols from backend
        logger.info("Fetching watchlist symbols from backend")
        symbols = await backend_client.get_watchlist_symbols()
        logger.info(f"Retrieved {len(symbols)} symbols from watchlists")
        
        if not symbols:
            logger.warning("No symbols found in watchlists, skipping price fetch")
            complete_job(job_id, records_processed=0)
            prune_history(job_name, keep=5)
            return
        
        # Step 2: Fetch current prices from external APIs
        logger.info(f"Fetching current prices for {len(symbols)} symbols")
        prices_data = await external_client.get_finnhub_prices(symbols)
        logger.info(f"Retrieved price data for {len(prices_data)} symbols")
        
        # Step 3: Store prices in backend's prices_realtime_cache table
        logger.info("Storing prices in backend's prices_realtime_cache")
        records_processed = await backend_client.store_prices(prices_data)
        
        complete_job(job_id, records_processed=records_processed)
        prune_history(job_name, keep=5)
        
        logger.info(f"Market data refresh completed: {records_processed} symbols updated")
        
    except Exception as e:
        logger.error(f"Market data refresh failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise