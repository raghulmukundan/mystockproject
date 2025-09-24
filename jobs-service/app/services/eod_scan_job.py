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

async def _trigger_technical_analysis_after_eod():
    """Trigger technical analysis after EOD scan completion"""
    try:
        from app.services.tech_job import run_tech_job
        from datetime import datetime, time

        # Check if it's a weekday (Monday=0, Sunday=6)
        now = datetime.now()
        if now.weekday() >= 5:  # Saturday=5, Sunday=6
            logger.info("Skipping technical analysis - weekend day")
            return

        # Check if it's reasonable business hours (not too late)
        current_time = now.time()
        if current_time > time(22, 0):  # After 10 PM
            logger.warning("Skipping technical analysis - too late in the day")
            return

        logger.info("Starting technical analysis after EOD completion...")
        result = await run_tech_job()
        logger.info(f"Technical analysis triggered by EOD completion: {result.get('updated_symbols', 0)} symbols processed")

    except Exception as e:
        logger.error(f"Failed to trigger technical analysis after EOD: {str(e)}")
        # Don't re-raise - EOD job should still be considered successful

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

        logger.info(f"EOD scan completed: {processed} symbols requested, {symbols_fetched} symbols fetched")

        # Trigger technical analysis job after successful EOD completion
        # This ensures technical analysis only runs when EOD data is fresh and available
        logger.info("EOD scan completed successfully. Triggering technical analysis...")
        await _trigger_technical_analysis_after_eod()

    except Exception as e:
        logger.error(f"EOD scan failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise