"""
End-of-day scan job
"""
import asyncio
import logging
import httpx
from app.services.job_status import begin_job, complete_job, fail_job, prune_history
from app.services.eod_scan_impl import run_eod_scan_all_symbols

logger = logging.getLogger(__name__)

async def _check_schwab_token_status():
    """Check if Schwab token is valid before starting EOD scan"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "http://external-apis:8003/schwab/token/status",
                timeout=10.0
            )

            if response.status_code != 200:
                logger.error(f"Token status check failed with HTTP {response.status_code}")
                return False, f"Token status endpoint returned HTTP {response.status_code}"

            token_status = response.json()
            logger.info(f"Token status check: {token_status}")

            # Check if credentials are available
            if not token_status.get('credentials_available', False):
                return False, "Schwab credentials not configured"

            # For pre-flight check, we don't require a fresh token since the first API call will refresh it
            # We just need credentials to be available
            return True, "Token credentials available"

    except httpx.RequestError as e:
        logger.error(f"Failed to connect to external-apis service: {e}")
        return False, f"Cannot connect to external-apis service: {e}"
    except Exception as e:
        logger.error(f"Unexpected error during token status check: {e}")
        return False, f"Token status check error: {e}"

async def _get_symbol_count():
    """Get estimated symbol count for logging purposes"""
    try:
        # This is just for informative logging, so use a reasonable estimate
        return "~9,700"
    except:
        return "many"


def run_eod_scan_job():
    """EOD scan job wrapper"""
    asyncio.run(_run_eod_scan_job())

async def _run_eod_scan_job():
    """Run end-of-day price scan"""
    job_name = "eod_price_scan"
    job_id = None
    try:
        logger.info(f"🚀 JOB START: {job_name} - Beginning EOD price scan job")
        job_id = begin_job(job_name)
        logger.info(f"📝 JOB TRACKING: {job_name} - Job ID {job_id} created in database")

        # Pre-flight check: Validate Schwab token before processing thousands of symbols
        logger.info("Performing pre-flight token validation...")
        token_valid, token_message = await _check_schwab_token_status()

        if not token_valid:
            error_msg = f"Pre-flight token check failed: {token_message}. Aborting EOD scan to avoid processing {await _get_symbol_count()} symbols with invalid credentials."
            logger.error(error_msg)
            raise Exception(error_msg)

        logger.info(f"Pre-flight token check passed: {token_message}")

        # Run EOD scan directly in jobs-service
        result = await run_eod_scan_all_symbols()

        # Extract records processed from result
        symbols_requested = result.get('symbols_requested', 0)
        symbols_fetched = result.get('symbols_fetched', 0)
        processed = symbols_requested

        complete_job(job_id, records_processed=processed)
        prune_history(job_name, keep=5)

        logger.info(f"✅ JOB COMPLETE: {job_name} - EOD scan completed: {processed} symbols requested, {symbols_fetched} symbols fetched")

        # Trigger next job in chain using centralized chain manager
        from app.core.job_chain_manager import trigger_next_job_in_chain
        await trigger_next_job_in_chain(job_name)

    except Exception as e:
        logger.error(f"❌ JOB FAILED: {job_name} - EOD scan failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
            logger.info(f"📝 JOB TRACKING: {job_name} - Job ID {job_id} marked as failed in database")
        raise