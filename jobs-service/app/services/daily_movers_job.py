"""
Daily movers calculation job
Analyzes daily price movements to identify top movers by sector and market cap
"""
import asyncio
import logging
from app.services.daily_movers_impl import run_daily_movers_compute

logger = logging.getLogger(__name__)

def run_daily_movers_job_scheduled():
    """Daily movers job wrapper for scheduled execution"""
    asyncio.run(run_daily_movers_job())

async def run_daily_movers_job():
    """Run daily movers analysis"""
    try:
        logger.info("Starting daily movers analysis job")
        result = await run_daily_movers_compute()
        logger.info(f"Daily movers analysis completed successfully: {result.get('total_movers', 0)} movers calculated across {result.get('sectors_processed', 0)} sectors")
        return result

    except Exception as e:
        logger.error(f"Daily movers analysis failed: {str(e)}")
        raise