"""
Centralized Job Chain Manager

Manages job dependencies and automatic triggering of downstream jobs.
Configuration is defined in job_chains.json.
"""
import json
import logging
import asyncio
from datetime import datetime, time
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Load job chain configuration
_config_path = Path(__file__).parent / "job_chains.json"
with open(_config_path, 'r') as f:
    _JOB_CHAINS_CONFIG = json.load(f)

JOB_CHAINS = _JOB_CHAINS_CONFIG['job_chains']


def get_next_job(job_name: str) -> Optional[str]:
    """
    Get the next job in the chain for the given job.

    Args:
        job_name: Name of the current job

    Returns:
        Name of the next job, or None if no chained job exists
    """
    job_config = JOB_CHAINS.get(job_name, {})
    return job_config.get('next_job')


def should_trigger_next_job(job_name: str) -> bool:
    """
    Check if conditions are met to trigger the next job in the chain.

    Args:
        job_name: Name of the current job

    Returns:
        True if next job should be triggered, False otherwise
    """
    job_config = JOB_CHAINS.get(job_name, {})
    conditions = job_config.get('conditions', {})

    if not conditions:
        return True

    now = datetime.now()

    # Check weekday condition
    if conditions.get('weekday_only', False):
        if now.weekday() >= 5:  # Saturday=5, Sunday=6
            logger.info(f"Skipping next job trigger for {job_name} - weekend day")
            return False

    # Check max hour condition
    max_hour = conditions.get('max_hour')
    if max_hour is not None:
        current_time = now.time()
        if current_time > time(max_hour, 0):
            logger.warning(f"Skipping next job trigger for {job_name} - too late in the day (after {max_hour}:00)")
            return False

    return True


async def trigger_next_job_in_chain(job_name: str) -> Optional[Dict[str, Any]]:
    """
    Automatically trigger the next job in the chain if configured.

    Args:
        job_name: Name of the job that just completed

    Returns:
        Result from the triggered job, or None if no job was triggered
    """
    next_job = get_next_job(job_name)

    if not next_job:
        logger.info(f"🏁 JOB CHAIN: {job_name} - No chained job configured, chain ends here")
        return None

    if not should_trigger_next_job(job_name):
        logger.info(f"⏸️  JOB CHAIN: {job_name} → {next_job} - Conditions not met, skipping trigger")
        return None

    logger.info(f"🔗 JOB CHAIN: {job_name} → {next_job} - Triggering next job in chain")

    try:
        # Import the appropriate job function based on next_job name
        result = await _execute_job(next_job)
        logger.info(f"✅ JOB CHAIN: {job_name} → {next_job} - Successfully triggered and completed")
        return result
    except Exception as e:
        logger.error(f"❌ JOB CHAIN: {job_name} → {next_job} - Failed to trigger: {str(e)}")
        # Don't re-raise - the parent job should still be considered successful
        return None


async def _execute_job(job_name: str) -> Dict[str, Any]:
    """
    Execute a job by name.

    Args:
        job_name: Name of the job to execute

    Returns:
        Result dictionary from the job execution
    """
    # Import job functions dynamically to avoid circular imports
    if job_name == "technical_compute":
        from app.services.tech_job import run_tech_job
        return await run_tech_job()

    elif job_name == "daily_movers_calculation":
        from app.services.daily_movers_job import run_daily_movers_job
        return await run_daily_movers_job()

    elif job_name == "daily_signals_computation":
        from app.services.daily_signals_job import run_daily_signals_job
        return await run_daily_signals_job()

    elif job_name == "weekly_technicals_etl":
        from app.services.weekly_technicals_job import run_weekly_technicals_job
        return await run_weekly_technicals_job()

    elif job_name == "weekly_signals_computation":
        from app.services.weekly_signals_job import run_weekly_signals_job
        return await run_weekly_signals_job()

    elif job_name == "weekly_bars_etl":
        from app.services.weekly_bars_job import run_weekly_bars_job
        return await run_weekly_bars_job()

    else:
        raise ValueError(f"Unknown job name: {job_name}")


def get_job_chain_info(job_name: str) -> Dict[str, Any]:
    """
    Get information about a job's chain configuration.

    Args:
        job_name: Name of the job

    Returns:
        Dictionary with chain information
    """
    job_config = JOB_CHAINS.get(job_name, {})
    return {
        "job_name": job_name,
        "next_job": job_config.get('next_job'),
        "description": job_config.get('description', 'No description'),
        "conditions": job_config.get('conditions', {}),
        "has_chain": job_config.get('next_job') is not None
    }


def get_all_chains() -> Dict[str, Any]:
    """
    Get information about all configured job chains.

    Returns:
        Dictionary with all job chain configurations
    """
    return JOB_CHAINS
