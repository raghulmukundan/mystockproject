"""
Daily Signals Computation Job
Computes daily signal flags, trend scores, and proposed trade levels
Integrated with jobs-service tracking and error handling
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

from app.services.job_status import begin_job, complete_job, fail_job, prune_history

logger = logging.getLogger(__name__)


class DailySignalsJob:
    """Daily signals computation job with tracking"""

    def __init__(self, db_dsn: str):
        self.engine = create_engine(db_dsn, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine)

    def load_sql_script(self) -> str:
        """Load the daily signals SQL script"""
        # SQL script is in /app parent directory (mystockproject/sql/)
        import pathlib
        sql_file = pathlib.Path(__file__).parent.parent.parent.parent / "sql" / "daily_signals_upsert.sql"

        if not sql_file.exists():
            raise FileNotFoundError(f"SQL script not found: {sql_file}")

        with open(sql_file, 'r') as f:
            return f.read()

    def execute_signals_computation(self) -> Dict[str, Any]:
        """Execute the daily signals SQL script"""
        sql_script = self.load_sql_script()

        with self.Session() as session:
            # Execute the SQL script
            session.execute(text(sql_script))
            session.commit()

        logger.info("✅ Daily signals computation complete")
        return {"success": True}

    def get_statistics(self) -> Dict[str, Any]:
        """Get statistics after signal computation"""
        stats_query = text("""
            SELECT
                COUNT(*) AS total_symbols,
                COUNT(*) FILTER (WHERE trend_score_d >= 40) AS strong_trend_count,
                COUNT(*) FILTER (WHERE donch20_breakout = TRUE) AS breakout_count,
                COUNT(*) FILTER (WHERE macd_cross_up = TRUE) AS macd_cross_count,
                COUNT(*) FILTER (WHERE sma20_cross_50_up = TRUE) AS sma_cross_count,
                COUNT(*) FILTER (WHERE proposed_entry IS NOT NULL) AS trade_setups_count,
                ROUND(
                    100.0 * COUNT(*) FILTER (WHERE trend_score_d >= 40) / NULLIF(COUNT(*), 0),
                    2
                ) AS pct_strong_trend
            FROM signals_daily_latest
        """)

        with self.Session() as session:
            result = session.execute(stats_query).fetchone()

        return {
            "total_symbols": result.total_symbols,
            "strong_trend_count": result.strong_trend_count,
            "breakout_count": result.breakout_count,
            "macd_cross_count": result.macd_cross_count,
            "sma_cross_count": result.sma_cross_count,
            "trade_setups_count": result.trade_setups_count,
            "pct_strong_trend": float(result.pct_strong_trend or 0)
        }

    async def run(self) -> Dict[str, Any]:
        """Execute daily signals job"""
        try:
            # Execute signals computation
            self.execute_signals_computation()

            # Get statistics
            stats = self.get_statistics()

            return {
                'success': True,
                **stats
            }

        except Exception as e:
            logger.error(f"Daily signals job failed: {str(e)}")
            raise


def run_daily_signals_job_scheduled():
    """Wrapper for scheduled execution"""
    asyncio.run(run_daily_signals_job())


async def run_daily_signals_job(job_id: int = None):
    """Run daily signals computation job with tracking"""
    job_name = "daily_signals_computation"

    try:
        logger.info(f"🚀 JOB START: {job_name} - Beginning daily signals computation")
        if job_id is None:
            job_id = begin_job(job_name)
            logger.info(f"📝 JOB TRACKING: {job_name} - Job ID {job_id} created")
        else:
            logger.info(f"📝 JOB TRACKING: {job_name} - Using existing Job ID {job_id}")

        # Get DB DSN from environment
        db_dsn = os.getenv('DATABASE_URL')
        if not db_dsn:
            raise ValueError("DATABASE_URL environment variable not set")

        # Run job
        job = DailySignalsJob(db_dsn)
        result = await job.run()

        # Mark complete
        complete_job(job_id, records_processed=result.get('total_symbols', 0))
        prune_history(job_name, keep=5)

        logger.info(f"✅ JOB COMPLETE: {job_name} - {result['total_symbols']} symbols, {result['strong_trend_count']} strong trends, {result['trade_setups_count']} trade setups")
        return result

    except Exception as e:
        logger.error(f"❌ JOB FAILED: {job_name} - {str(e)}")
        if job_id:
            fail_job(job_id, str(e))
            logger.info(f"📝 JOB TRACKING: {job_name} - Job ID {job_id} marked as failed")
        raise
