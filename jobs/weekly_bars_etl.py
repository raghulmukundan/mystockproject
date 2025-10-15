#!/usr/bin/env python3
"""
Weekly Bars ETL Job

Aggregates daily bars (from historical_prices + current_prices) into weekly bars.
Week ends on Friday (or last trading day of the week if Friday is a holiday).

Usage:
    python jobs/weekly_bars_etl.py [--weeks=120] [--dry-run]

Environment:
    DB_DSN: PostgreSQL connection string (postgresql+psycopg://user:pass@host:5432/db)
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class WeeklyBarsETL:
    """Aggregates daily bars into weekly OHLCV data"""

    def __init__(self, db_dsn: str):
        self.engine = create_engine(db_dsn, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine)

    def get_merged_daily_bars(self, weeks: int = 120) -> pd.DataFrame:
        """
        Fetch merged daily bars from historical_prices and current_prices
        for the last N weeks.
        """
        cutoff_date = datetime.now().date() - timedelta(weeks=weeks)

        query = text("""
            WITH merged_daily AS (
                -- Historical prices
                SELECT
                    symbol,
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    'historical' as source
                FROM historical_prices
                WHERE date >= :cutoff_date

                UNION ALL

                -- Current prices (EOD from Schwab)
                SELECT
                    symbol,
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    'current' as source
                FROM current_prices
                WHERE date >= :cutoff_date
            ),
            -- Deduplicate: prefer current_prices over historical_prices
            deduped AS (
                SELECT DISTINCT ON (symbol, date)
                    symbol,
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume
                FROM merged_daily
                ORDER BY symbol, date, source DESC  -- 'historical' < 'current'
            )
            SELECT * FROM deduped
            ORDER BY symbol, date
        """)

        with self.Session() as session:
            result = session.execute(query, {"cutoff_date": cutoff_date})
            df = pd.DataFrame(result.fetchall(), columns=result.keys())

        logger.info(f"Loaded {len(df):,} daily bars for {df['symbol'].nunique():,} symbols")
        return df

    def aggregate_to_weekly(self, daily_df: pd.DataFrame) -> pd.DataFrame:
        """
        Aggregate daily bars to weekly bars.
        Week ends on Friday (or last trading day of week).
        """
        if daily_df.empty:
            return pd.DataFrame()

        # Ensure date is datetime
        daily_df['date'] = pd.to_datetime(daily_df['date'])
        daily_df = daily_df.sort_values(['symbol', 'date'])

        # Assign week ending (Friday)
        daily_df['week_end'] = daily_df['date'] + pd.to_timedelta(
            (4 - daily_df['date'].dt.dayofweek) % 7, unit='D'
        )

        # Group by symbol and week_end
        weekly = daily_df.groupby(['symbol', 'week_end']).agg({
            'open': 'first',   # First open of the week
            'high': 'max',     # Highest high
            'low': 'min',      # Lowest low
            'close': 'last',   # Last close of the week
            'volume': 'sum'    # Total volume
        }).reset_index()

        logger.info(f"Aggregated to {len(weekly):,} weekly bars for {weekly['symbol'].nunique():,} symbols")
        return weekly

    def upsert_weekly_bars(self, weekly_df: pd.DataFrame, dry_run: bool = False) -> int:
        """
        Upsert weekly bars into weekly_bars table.
        Uses ON CONFLICT DO UPDATE for idempotency.
        """
        if weekly_df.empty:
            logger.warning("No weekly bars to upsert")
            return 0

        if dry_run:
            logger.info(f"[DRY RUN] Would upsert {len(weekly_df):,} weekly bars")
            logger.info(f"Sample:\n{weekly_df.head()}")
            return len(weekly_df)

        upsert_query = text("""
            INSERT INTO weekly_bars (symbol, week_end, open, high, low, close, volume, updated_at)
            VALUES (:symbol, :week_end, :open, :high, :low, :close, :volume, NOW())
            ON CONFLICT (symbol, week_end)
            DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                updated_at = NOW()
        """)

        inserted = 0
        with self.Session() as session:
            for _, row in weekly_df.iterrows():
                session.execute(upsert_query, {
                    'symbol': row['symbol'],
                    'week_end': row['week_end'],
                    'open': float(row['open']),
                    'high': float(row['high']),
                    'low': float(row['low']),
                    'close': float(row['close']),
                    'volume': int(row['volume'])
                })
                inserted += 1

                if inserted % 1000 == 0:
                    logger.info(f"Upserted {inserted:,} weekly bars...")

            session.commit()

        logger.info(f"✅ Upserted {inserted:,} weekly bars")
        return inserted

    def run(self, weeks: int = 120, dry_run: bool = False) -> Dict[str, Any]:
        """Execute the weekly bars ETL pipeline"""
        logger.info("="*60)
        logger.info("WEEKLY BARS ETL - START")
        logger.info("="*60)

        start_time = datetime.now()

        # Step 1: Fetch merged daily bars
        daily_df = self.get_merged_daily_bars(weeks=weeks)

        if daily_df.empty:
            logger.error("No daily bars found - aborting")
            return {"success": False, "error": "No daily bars"}

        # Step 2: Aggregate to weekly
        weekly_df = self.aggregate_to_weekly(daily_df)

        # Step 3: Upsert to database
        count = self.upsert_weekly_bars(weekly_df, dry_run=dry_run)

        elapsed = (datetime.now() - start_time).total_seconds()

        result = {
            "success": True,
            "symbols_updated": weekly_df['symbol'].nunique(),
            "weekly_bars_upserted": count,
            "elapsed_seconds": elapsed
        }

        logger.info("="*60)
        logger.info(f"✅ Symbols updated: {result['symbols_updated']:,}")
        logger.info(f"✅ Weekly bars upserted: {result['weekly_bars_upserted']:,}")
        logger.info(f"⏱️  Elapsed: {elapsed:.2f}s")
        logger.info("="*60)

        return result


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Weekly Bars ETL')
    parser.add_argument('--weeks', type=int, default=120, help='Number of weeks to process (default: 120)')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode (no database writes)')
    args = parser.parse_args()

    # Get DB DSN from environment
    db_dsn = os.getenv('DB_DSN')
    if not db_dsn:
        logger.error("DB_DSN environment variable not set")
        sys.exit(1)

    try:
        etl = WeeklyBarsETL(db_dsn)
        result = etl.run(weeks=args.weeks, dry_run=args.dry_run)

        if not result['success']:
            sys.exit(1)

    except Exception as e:
        logger.exception(f"Weekly bars ETL failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
