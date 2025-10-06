"""
Asset metadata enrichment job wrapper
One-time job to enrich asset metadata with sector, industry, and market cap data
"""
import asyncio
import logging
from app.services.asset_metadata_enrichment import run_asset_metadata_enrichment

logger = logging.getLogger(__name__)

def run_asset_metadata_enrichment_job_scheduled():
    """
    Scheduled job wrapper for asset metadata enrichment
    """
    asyncio.run(run_asset_metadata_enrichment_job())

async def run_asset_metadata_enrichment_job():
    """
    Async job runner for asset metadata enrichment
    """
    try:
        logger.info("Starting asset metadata enrichment job")
        result = await run_asset_metadata_enrichment()
        logger.info(f"Asset metadata enrichment job completed: {result}")
        return result
    except Exception as e:
        logger.error(f"Asset metadata enrichment job failed: {str(e)}", exc_info=True)
        raise