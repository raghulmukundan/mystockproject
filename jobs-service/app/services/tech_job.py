"""
Technical analysis job
"""
import asyncio
import logging
from app.services.tech_impl import run_technical_compute

logger = logging.getLogger(__name__)

def run_tech_job_scheduled():
    """Tech job wrapper for scheduled execution"""
    asyncio.run(run_tech_job())

async def run_tech_job():
    """Run technical analysis computation"""
    try:
        logger.info("Starting technical analysis job")
        result = await run_technical_compute()
        logger.info(f"Technical analysis completed successfully: {result['updated_symbols']} symbols updated")
        return result

    except Exception as e:
        logger.error(f"Technical analysis failed: {str(e)}")
        raise