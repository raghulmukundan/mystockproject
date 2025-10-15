"""
Technical analysis job
"""
import asyncio
import logging
from app.services.tech_impl import run_technical_compute
from app.core.job_chain_manager import trigger_next_job_in_chain

logger = logging.getLogger(__name__)

def run_tech_job_scheduled():
    """Tech job wrapper for scheduled execution"""
    asyncio.run(run_tech_job())

async def run_tech_job():
    """Run technical analysis computation"""
    job_name = "technical_compute"
    try:
        logger.info(f"🚀 JOB START: {job_name} - Beginning technical analysis computation")
        result = await run_technical_compute()
        logger.info(f"✅ JOB COMPLETE: {job_name} - Technical analysis completed successfully: {result['updated_symbols']} symbols updated")

        # Trigger next job in chain using centralized chain manager
        await trigger_next_job_in_chain(job_name)

        return result

    except Exception as e:
        logger.error(f"❌ JOB FAILED: {job_name} - Technical analysis failed: {str(e)}")
        raise