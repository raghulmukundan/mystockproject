"""
Technical analysis job
"""
import asyncio
import logging
from app.services.tech_impl import run_technical_compute

logger = logging.getLogger(__name__)

async def _trigger_daily_movers_after_tech():
    """Trigger daily movers calculation after technical analysis completion"""
    try:
        from app.services.daily_movers_job import run_daily_movers_job
        from datetime import datetime, time

        # Check if it's a weekday (Monday=0, Sunday=6)
        now = datetime.now()
        if now.weekday() >= 5:  # Saturday=5, Sunday=6
            logger.info("Skipping daily movers calculation - weekend day")
            return

        # Check if it's reasonable business hours (not too late)
        current_time = now.time()
        if current_time > time(22, 0):  # After 10 PM
            logger.warning("Skipping daily movers calculation - too late in the day")
            return

        logger.info("Starting daily movers calculation after technical analysis completion...")
        result = await run_daily_movers_job()
        total_movers = result.get('total_movers', 0) if result else 0
        logger.info(f"Daily movers calculation triggered by technical analysis completion: {total_movers} movers processed")

    except Exception as e:
        logger.error(f"Failed to trigger daily movers calculation after technical analysis: {str(e)}")
        # Don't re-raise - technical analysis job should still be considered successful

def run_tech_job_scheduled():
    """Tech job wrapper for scheduled execution"""
    asyncio.run(run_tech_job())

async def run_tech_job():
    """Run technical analysis computation"""
    try:
        logger.info("Starting technical analysis job")
        result = await run_technical_compute()
        logger.info(f"Technical analysis completed successfully: {result['updated_symbols']} symbols updated")

        # Trigger daily movers calculation after successful technical analysis completion
        # This ensures daily movers calculation only runs when technical data is fresh and available
        logger.info("Technical analysis completed successfully. Triggering daily movers calculation...")
        await _trigger_daily_movers_after_tech()

        return result

    except Exception as e:
        logger.error(f"Technical analysis failed: {str(e)}")
        raise