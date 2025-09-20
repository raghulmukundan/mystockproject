"""
Technical analysis job
"""
import asyncio
import logging
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.external_client import backend_client

logger = logging.getLogger(__name__)

def run_tech_job_scheduled():
    """Tech job wrapper for scheduled execution"""
    asyncio.run(run_tech_job())

async def run_tech_job():
    """Run technical analysis computation"""
    job_name = "technical_compute"
    job_id = None
    try:
        logger.info("Starting technical analysis job")
        job_id = begin_job(job_name)
        
        # Call external APIs service to run technical analysis
        result = await backend_client.run_tech_analysis()
        
        # Extract records processed from result
        records_processed = result.get('updated_symbols', 0)
        
        complete_job(job_id, records_processed=records_processed)
        prune_history(job_name, keep=5)
        
        logger.info(f"Technical analysis completed: {records_processed} symbols processed")
        
    except Exception as e:
        logger.error(f"Technical analysis failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise