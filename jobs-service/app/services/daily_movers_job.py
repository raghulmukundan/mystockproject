"""
Daily movers calculation job
Analyzes daily price movements to identify top movers by sector and market cap
"""
import asyncio
import logging
from app.services.daily_movers_impl import run_daily_movers_compute
from app.services.job_status import begin_job, complete_job, fail_job, prune_history

logger = logging.getLogger(__name__)

def run_daily_movers_job_scheduled():
    """Daily movers job wrapper for scheduled execution"""
    asyncio.run(run_daily_movers_job())

async def run_daily_movers_job():
    """Run daily movers analysis"""
    job_name = "daily_movers_calculation"
    job_id = None
    try:
        logger.info("Starting daily movers analysis job")
        job_id = begin_job(job_name)

        result = await run_daily_movers_compute()
        total_movers = result.get('total_movers', 0)

        complete_job(job_id, records_processed=total_movers)
        prune_history(job_name, keep=5)

        logger.info(f"Daily movers analysis completed successfully: {total_movers} movers calculated across {result.get('sectors_processed', 0)} sectors")
        return result

    except Exception as e:
        logger.error(f"Daily movers analysis failed: {str(e)}")
        if job_id:
            fail_job(job_id, str(e))
        raise