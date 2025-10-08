"""
Weekly Bars ETL Job
Aggregates daily price data to weekly bars (Friday week-end)
Integrated with jobs-service tracking and error handling
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

from app.services.job_status import begin_job, complete_job, fail_job, prune_history, update_job_progress
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)


class WeeklyBarsJob:
    """Weekly bars aggregation job with tracking"""

    def __init__(self, db_dsn: str, weeks: int = 120):
        self.engine = create_engine(db_dsn, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine)
        self.weeks = weeks
        self.job_id = None

    def get_daily_data(self) -> pd.DataFrame:
        """Load daily price data from unified_price_data view with data validation"""
        query = text(f"""
            SELECT DISTINCT ON (symbol, date)
                symbol, date, open, high, low, close, volume
            FROM unified_price_data
            WHERE date::date >= CURRENT_DATE - INTERVAL '{self.weeks * 7 + 30} days'
                AND open > 0 AND open < 100000
                AND high > 0 AND high < 100000
                AND low > 0 AND low < 100000
                AND close > 0 AND close < 100000
                AND volume >= 0
            ORDER BY symbol, date DESC, data_source DESC
        """)

        with self.Session() as session:
            df = pd.read_sql(query, session.connection())

        logger.info(f"Loaded {len(df)} daily bars from database (filtered for valid prices)")
        return df

    def aggregate_to_weekly(self, daily_df: pd.DataFrame) -> pd.DataFrame:
        """Aggregate to Friday week-end"""
        if daily_df.empty:
            return pd.DataFrame()

        daily_df['date'] = pd.to_datetime(daily_df['date'])

        # Calculate Friday week-end (offset to Friday, or use last trading day of week)
        daily_df['week_end'] = daily_df['date'] + pd.to_timedelta(
            (4 - daily_df['date'].dt.dayofweek) % 7, unit='D'
        )

        # Group by symbol and week_end
        weekly = daily_df.groupby(['symbol', 'week_end']).agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).reset_index()

        weekly = weekly.sort_values(['symbol', 'week_end'])

        logger.info(f"Aggregated to {len(weekly)} weekly bars")
        return weekly

    def upsert_weekly_bars(self, weekly_df: pd.DataFrame) -> Dict[str, int]:
        """Upsert weekly bars with ON CONFLICT DO UPDATE"""
        if weekly_df.empty:
            return {'inserted': 0, 'updated': 0}

        inserted = 0
        updated = 0

        with self.Session() as session:
            for _, row in weekly_df.iterrows():
                # Check if exists
                exists = session.execute(
                    text("""
                        SELECT id FROM weekly_bars
                        WHERE symbol = :symbol AND week_end = :week_end
                    """),
                    {
                        'symbol': row['symbol'],
                        'week_end': row['week_end']
                    }
                ).fetchone()

                if exists:
                    # Update if values differ
                    session.execute(
                        text("""
                            UPDATE weekly_bars
                            SET open = :open, high = :high, low = :low,
                                close = :close, volume = :volume
                            WHERE symbol = :symbol AND week_end = :week_end
                            AND (open != :open OR high != :high OR low != :low
                                 OR close != :close OR volume != :volume)
                        """),
                        {
                            'symbol': row['symbol'],
                            'week_end': row['week_end'],
                            'open': float(row['open']),
                            'high': float(row['high']),
                            'low': float(row['low']),
                            'close': float(row['close']),
                            'volume': int(row['volume'])
                        }
                    )
                    if session.execute(text("SELECT ROW_COUNT()")).scalar() > 0:
                        updated += 1
                else:
                    # Insert new
                    session.execute(
                        text("""
                            INSERT INTO weekly_bars (symbol, week_end, open, high, low, close, volume)
                            VALUES (:symbol, :week_end, :open, :high, :low, :close, :volume)
                        """),
                        {
                            'symbol': row['symbol'],
                            'week_end': row['week_end'],
                            'open': float(row['open']),
                            'high': float(row['high']),
                            'low': float(row['low']),
                            'close': float(row['close']),
                            'volume': int(row['volume'])
                        }
                    )
                    inserted += 1

                # Update progress every 100 records
                if (inserted + updated) % 100 == 0 and self.job_id:
                    update_job_progress(self.job_id, inserted + updated)

            session.commit()

        logger.info(f"Upserted weekly bars: {inserted} inserted, {updated} updated")
        return {'inserted': inserted, 'updated': updated}

    async def run(self) -> Dict[str, Any]:
        """Execute weekly bars job"""
        try:
            # Get daily data
            daily_df = self.get_daily_data()
            if daily_df.empty:
                logger.warning("No daily data found")
                return {'success': True, 'inserted': 0, 'updated': 0}

            # Aggregate to weekly
            weekly_df = self.aggregate_to_weekly(daily_df)
            if weekly_df.empty:
                logger.warning("No weekly bars generated")
                return {'success': True, 'inserted': 0, 'updated': 0}

            # Upsert
            stats = self.upsert_weekly_bars(weekly_df)

            return {
                'success': True,
                'inserted': stats['inserted'],
                'updated': stats['updated'],
                'total_bars': len(weekly_df),
                'symbols_processed': weekly_df['symbol'].nunique()
            }

        except Exception as e:
            logger.error(f"Weekly bars job failed: {str(e)}")
            raise


def run_weekly_bars_job_scheduled():
    """Wrapper for scheduled execution"""
    asyncio.run(run_weekly_bars_job())


async def run_weekly_bars_job(job_id: int = None):
    """Run weekly bars ETL job with tracking"""
    job_name = "weekly_bars_etl"

    try:
        logger.info(f"🚀 JOB START: {job_name} - Beginning weekly bars aggregation")
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
        job = WeeklyBarsJob(db_dsn, weeks=120)
        job.job_id = job_id
        result = await job.run()

        # Mark complete
        total_records = result.get('inserted', 0) + result.get('updated', 0)
        complete_job(job_id, records_processed=total_records)
        prune_history(job_name, keep=5)

        logger.info(f"✅ JOB COMPLETE: {job_name} - {result['inserted']} inserted, {result['updated']} updated, {result['symbols_processed']} symbols")

        # Trigger weekly technicals ETL after weekly bars completes
        logger.info("🔗 CHAINING: Triggering weekly_technicals_etl after weekly_bars completion")
        from app.services.weekly_technicals_job import run_weekly_technicals_job
        try:
            await run_weekly_technicals_job()
            logger.info("✅ CHAINING: weekly_technicals_etl completed successfully")
        except Exception as chain_error:
            logger.error(f"❌ CHAINING: weekly_technicals_etl failed: {str(chain_error)}")

        return result

    except Exception as e:
        logger.error(f"❌ JOB FAILED: {job_name} - {str(e)}")
        if job_id:
            fail_job(job_id, str(e))
            logger.info(f"📝 JOB TRACKING: {job_name} - Job ID {job_id} marked as failed")
        raise
