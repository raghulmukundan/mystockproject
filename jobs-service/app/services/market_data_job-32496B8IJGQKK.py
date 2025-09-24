"""
Market data refresh job
"""
import asyncio
import logging
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.external_client import backend_client

logger = logging.getLogger(__name__)

def update_market_data_job():
    """Market data refresh job wrapper"""
    asyncio.run(_update_market_data_job())

def update_market_data_job_bypass_hours():
    """Market data refresh job wrapper that bypasses market hours restriction"""
    asyncio.run(_update_market_data_job(bypass_market_hours=True))

async def _update_market_data_job(bypass_market_hours=False):
    """Update market data using new backend fetch-and-store endpoint"""
    job_name = "market_data_refresh"
    job_id = None
    try:
        if bypass_market_hours:
            logger.info("Starting market data refresh job (bypassing market hours)")
        else:
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

        # Step 2: Use new backend endpoint to fetch from Finnhub and store in prices_daily
        logger.info(f"Calling backend fetch-and-store endpoint for {len(symbols)} symbols")
        import httpx

        async with httpx.AsyncClient(timeout=120.0) as client:
            payload = {"symbols": symbols}
            response = await client.post(
                "http://backend:8002/api/prices/fetch-and-store",
                json=payload
            )
            response.raise_for_status()
            result = response.json()

        records_processed = result.get('total_stored', 0)
        symbols_failed = result.get('symbols_failed', [])

        if symbols_failed:
            logger.warning(f"Failed to fetch prices for {len(symbols_failed)} symbols: {symbols_failed}")

        complete_job(job_id, records_processed=records_processed)
        prune_history(job_name, keep=5)

        logger.info(f"Market data refresh completed: {records_processed} symbols updated")

    except Exception as e:
        logger.error(f"Market data refresh failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise