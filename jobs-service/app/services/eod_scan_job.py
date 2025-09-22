"""
End-of-day scan job
"""
import asyncio
import logging
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.eod_scan_impl import run_eod_scan_all_symbols

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

        # Run EOD scan directly in jobs-service
        result = await run_eod_scan_all_symbols()

        # Extract records processed from result
        symbols_requested = result.get('symbols_requested', 0)
        symbols_fetched = result.get('symbols_fetched', 0)
        processed = symbols_requested

        complete_job(job_id, records_processed=processed)
        prune_history(job_name, keep=5)

        logger.info(f"EOD scan completed: {processed} symbols requested, {symbols_fetched} symbols fetched")
        logger.info("EOD scan job finished. Technical analysis will run separately at 18:00.")

    except Exception as e:
        logger.error(f"EOD scan failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise