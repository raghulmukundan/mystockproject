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
        
    except Exception as e:
        logger.error(f"Universe refresh failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise