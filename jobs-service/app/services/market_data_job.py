"""
Market data refresh job
"""
import asyncio
import logging
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.external_client import backend_client, external_client
from app.services.price_storage import price_storage

logger = logging.getLogger(__name__)

def update_market_data_job():
    """Market data refresh job wrapper"""
    asyncio.run(_update_market_data_job())

async def _update_market_data_job():
    """Update market data from external APIs"""
    job_name = "market_data_refresh"
    job_id = None
    try:
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
        
        # Step 3: Store prices in jobs service database
        logger.info("Storing prices in local cache")
        records_processed = await price_storage.store_prices(prices_data)
        
        complete_job(job_id, records_processed=records_processed)
        prune_history(job_name, keep=5)
        
        logger.info(f"Market data refresh completed: {records_processed} symbols updated")
        
    except Exception as e:
        logger.error(f"Market data refresh failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise