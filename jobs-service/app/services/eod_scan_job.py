"""
End-of-day scan job
"""
import asyncio
import logging
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.external_client import backend_client
from app.services.tech_job import run_tech_job

logger = logging.getLogger(__name__)

def run_eod_scan_job():
    """EOD scan job wrapper"""
    asyncio.run(_run_eod_scan_job())

async def _run_eod_scan_job():
    """Run end-of-day price scan"""
    job_name = "eod_price_scan"
    job_id = None
    try:
        logger.info("Starting EOD price scan job")
        job_id = begin_job(job_name)
        
        # Call external APIs service to run EOD scan
        result = await backend_client.run_eod_scan()
        
        # Extract records processed from result
        # EOD scan returns scan summary with symbols_requested and symbols_fetched
        symbols_requested = result.get('symbols_requested', 0)
        symbols_fetched = result.get('symbols_fetched', 0)
        processed = symbols_requested
        
        complete_job(job_id, records_processed=processed)
        prune_history(job_name, keep=5)
        
        logger.info(f"EOD scan completed: {processed} symbols requested, {symbols_fetched} symbols fetched")
        
        # Trigger technical analysis after successful EOD scan
        logger.info("Triggering technical analysis after EOD scan")
        await run_tech_job()
        
    except Exception as e:
        logger.error(f"EOD scan failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise