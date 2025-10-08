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
        logger.info(f"🚀 JOB START: {job_name} - Beginning daily movers analysis job")
        job_id = begin_job(job_name)
        logger.info(f"📝 JOB TRACKING: {job_name} - Job ID {job_id} created in database")

        result = await run_daily_movers_compute()
        total_movers = result.get('total_movers', 0)

        complete_job(job_id, records_processed=total_movers)
        prune_history(job_name, keep=5)

        logger.info(f"✅ JOB COMPLETE: {job_name} - Daily movers analysis completed successfully: {total_movers} movers calculated across {result.get('sectors_processed', 0)} sectors")

        # Trigger daily signals computation after daily movers completes
        logger.info("🔗 CHAINING: Triggering daily_signals_computation after daily_movers completion")
        from app.services.daily_signals_job import run_daily_signals_job
        try:
            await run_daily_signals_job()
            logger.info("✅ CHAINING: daily_signals_computation completed successfully")
        except Exception as chain_error:
            logger.error(f"❌ CHAINING: daily_signals_computation failed: {str(chain_error)}")

        return result

    except Exception as e:
        logger.error(f"❌ JOB FAILED: {job_name} - Daily movers analysis failed: {str(e)}")
        if job_id:
            fail_job(job_id, str(e))
            logger.info(f"📝 JOB TRACKING: {job_name} - Job ID {job_id} marked as failed in database")
        raise