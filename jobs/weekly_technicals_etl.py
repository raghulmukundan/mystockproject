#!/usr/bin/env python3
"""
Weekly Technicals ETL Job

Computes weekly technical indicators from weekly_bars using pandas-ta.
Includes: SMA10w, SMA30w, SMA40w, RSI14w, ADX14w, ATR14w, Donchian, MACD,
volume metrics, 52-week high tracking, and SMA slope.

Usage:
    python jobs/weekly_technicals_etl.py [--symbols=AAPL,MSFT] [--dry-run]

Environment:
    DB_DSN: PostgreSQL connection string
"""

import os
import sys
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# pandas_ta for technical indicators
try:
    import pandas_ta as ta
except ImportError:
    logging.error("pandas_ta not installed. Run: pip install pandas-ta")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class WeeklyTechnicalsETL:
    """Computes weekly technical indicators from weekly bars"""

    def __init__(self, db_dsn: str):
        self.engine = create_engine(db_dsn, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine)

    def get_symbols(self, filter_symbols: Optional[List[str]] = None) -> List[str]:
        """Get list of symbols to process"""
        query = text("""
            SELECT DISTINCT symbol
            FROM weekly_bars
            ORDER BY symbol
        """)

        with self.Session() as session:
            result = session.execute(query)
            symbols = [row[0] for row in result]

        if filter_symbols:
            symbols = [s for s in symbols if s in filter_symbols]

        logger.info(f"Processing {len(symbols):,} symbols")
        return symbols

    def load_weekly_bars(self, symbol: str, weeks: int = 120) -> pd.DataFrame:
        """Load weekly bars for a symbol"""
        query = text("""
            SELECT
                symbol,
                week_end,
                open,
                high,
                low,
                close,
                volume
            FROM weekly_bars
            WHERE symbol = :symbol
            ORDER BY week_end ASC
            LIMIT :limit
        """)

        with self.Session() as session:
            result = session.execute(query, {"symbol": symbol, "limit": weeks})
            df = pd.DataFrame(result.fetchall(), columns=result.keys())

        if df.empty:
            return df

        # Ensure proper types
        df['week_end'] = pd.to_datetime(df['week_end'])
        for col in ['open', 'high', 'low', 'close']:
            df[col] = df[col].astype(float)
        df['volume'] = df['volume'].astype(int)

        return df

    def compute_sma_slope(self, sma_series: pd.Series, window: int = 4) -> float:
        """
        Compute slope of SMA using linear regression over last N weeks.
        Returns the slope coefficient.
        """
        if len(sma_series) < window:
            return None

        recent = sma_series.tail(window).dropna()
        if len(recent) < 2:
            return None

        x = np.arange(len(recent))
        y = recent.values

        # Simple linear regression
        slope = np.polyfit(x, y, 1)[0]
        return float(slope)

    def compute_technicals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Compute all weekly technical indicators"""
        if df.empty or len(df) < 40:  # Need at least 40 weeks for SMA40
            return pd.DataFrame()

        symbol = df['symbol'].iloc[0]

        # Prepare DataFrame for pandas_ta
        df = df.set_index('week_end')
        df.ta.cores = 0  # Disable multiprocessing for stability

        # ============================================================
        # Moving Averages
        # ============================================================
        df['sma10w'] = ta.sma(df['close'], length=10)
        df['sma30w'] = ta.sma(df['close'], length=30)
        df['sma40w'] = ta.sma(df['close'], length=40)

        # ============================================================
        # RSI (14 weeks)
        # ============================================================
        df['rsi14w'] = ta.rsi(df['close'], length=14)

        # ============================================================
        # ADX (14 weeks)
        # ============================================================
        adx_df = ta.adx(df['high'], df['low'], df['close'], length=14)
        if adx_df is not None and not adx_df.empty:
            df['adx14w'] = adx_df[f'ADX_14']

        # ============================================================
        # ATR (14 weeks)
        # ============================================================
        atr_series = ta.atr(df['high'], df['low'], df['close'], length=14)
        if atr_series is not None:
            df['atr14w'] = atr_series

        # ============================================================
        # Donchian Channels (20 weeks)
        # ============================================================
        donch = ta.donchian(df['high'], df['low'], lower_length=20, upper_length=20)
        if donch is not None and not donch.empty:
            df['donch20w_high'] = donch[f'DCU_20_20']
            df['donch20w_low'] = donch[f'DCL_20_20']

        # ============================================================
        # MACD (12, 26, 9)
        # ============================================================
        macd_df = ta.macd(df['close'], fast=12, slow=26, signal=9)
        if macd_df is not None and not macd_df.empty:
            df['macd_w'] = macd_df['MACD_12_26_9']
            df['macd_signal_w'] = macd_df['MACDs_12_26_9']
            df['macd_hist_w'] = macd_df['MACDh_12_26_9']

        # ============================================================
        # Volume Metrics
        # ============================================================
        df['avg_vol10w'] = df['volume'].rolling(window=10).mean()

        # ============================================================
        # 52-week High Tracking
        # ============================================================
        df['high_52w'] = df['high'].rolling(window=52, min_periods=1).max()
        df['distance_to_52w_high_w'] = (df['close'] - df['high_52w']) / df['high_52w']

        # ============================================================
        # SMA Slope (trend direction)
        # ============================================================
        df['sma_w_slope'] = df['sma30w'].rolling(window=4).apply(
            lambda x: self.compute_sma_slope(x, window=4) if len(x) >= 2 else None,
            raw=False
        )

        # Reset index and clean
        df = df.reset_index()
        df['symbol'] = symbol

        return df

    def upsert_technicals(self, tech_df: pd.DataFrame, dry_run: bool = False) -> int:
        """Upsert technical indicators to technical_weekly table"""
        if tech_df.empty:
            return 0

        if dry_run:
            logger.info(f"[DRY RUN] Would upsert {len(tech_df)} weekly technicals for {tech_df['symbol'].iloc[0]}")
            return len(tech_df)

        upsert_query = text("""
            INSERT INTO technical_weekly (
                symbol, week_end, close, volume,
                sma10w, sma30w, sma40w,
                rsi14w, adx14w, atr14w,
                donch20w_high, donch20w_low,
                macd_w, macd_signal_w, macd_hist_w,
                avg_vol10w,
                high_52w, distance_to_52w_high_w,
                sma_w_slope,
                updated_at
            ) VALUES (
                :symbol, :week_end, :close, :volume,
                :sma10w, :sma30w, :sma40w,
                :rsi14w, :adx14w, :atr14w,
                :donch20w_high, :donch20w_low,
                :macd_w, :macd_signal_w, :macd_hist_w,
                :avg_vol10w,
                :high_52w, :distance_to_52w_high_w,
                :sma_w_slope,
                NOW()
            )
            ON CONFLICT (symbol, week_end)
            DO UPDATE SET
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                sma10w = EXCLUDED.sma10w,
                sma30w = EXCLUDED.sma30w,
                sma40w = EXCLUDED.sma40w,
                rsi14w = EXCLUDED.rsi14w,
                adx14w = EXCLUDED.adx14w,
                atr14w = EXCLUDED.atr14w,
                donch20w_high = EXCLUDED.donch20w_high,
                donch20w_low = EXCLUDED.donch20w_low,
                macd_w = EXCLUDED.macd_w,
                macd_signal_w = EXCLUDED.macd_signal_w,
                macd_hist_w = EXCLUDED.macd_hist_w,
                avg_vol10w = EXCLUDED.avg_vol10w,
                high_52w = EXCLUDED.high_52w,
                distance_to_52w_high_w = EXCLUDED.distance_to_52w_high_w,
                sma_w_slope = EXCLUDED.sma_w_slope,
                updated_at = NOW()
        """)

        inserted = 0
        with self.Session() as session:
            for _, row in tech_df.iterrows():
                params = {
                    'symbol': row['symbol'],
                    'week_end': row['week_end'],
                    'close': float(row['close']) if pd.notna(row['close']) else None,
                    'volume': int(row['volume']) if pd.notna(row['volume']) else None,
                    'sma10w': float(row['sma10w']) if pd.notna(row['sma10w']) else None,
                    'sma30w': float(row['sma30w']) if pd.notna(row['sma30w']) else None,
                    'sma40w': float(row['sma40w']) if pd.notna(row['sma40w']) else None,
                    'rsi14w': float(row['rsi14w']) if pd.notna(row['rsi14w']) else None,
                    'adx14w': float(row.get('adx14w')) if pd.notna(row.get('adx14w')) else None,
                    'atr14w': float(row.get('atr14w')) if pd.notna(row.get('atr14w')) else None,
                    'donch20w_high': float(row.get('donch20w_high')) if pd.notna(row.get('donch20w_high')) else None,
                    'donch20w_low': float(row.get('donch20w_low')) if pd.notna(row.get('donch20w_low')) else None,
                    'macd_w': float(row.get('macd_w')) if pd.notna(row.get('macd_w')) else None,
                    'macd_signal_w': float(row.get('macd_signal_w')) if pd.notna(row.get('macd_signal_w')) else None,
                    'macd_hist_w': float(row.get('macd_hist_w')) if pd.notna(row.get('macd_hist_w')) else None,
                    'avg_vol10w': int(row.get('avg_vol10w')) if pd.notna(row.get('avg_vol10w')) else None,
                    'high_52w': float(row.get('high_52w')) if pd.notna(row.get('high_52w')) else None,
                    'distance_to_52w_high_w': float(row.get('distance_to_52w_high_w')) if pd.notna(row.get('distance_to_52w_high_w')) else None,
                    'sma_w_slope': float(row.get('sma_w_slope')) if pd.notna(row.get('sma_w_slope')) else None,
                }
                session.execute(upsert_query, params)
                inserted += 1

            session.commit()

        return inserted

    def refresh_materialized_view(self, dry_run: bool = False):
        """Refresh the technical_weekly_latest materialized view"""
        if dry_run:
            logger.info("[DRY RUN] Would refresh MATERIALIZED VIEW technical_weekly_latest")
            return

        with self.Session() as session:
            session.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY technical_weekly_latest"))
            session.commit()

        logger.info("✅ Refreshed MATERIALIZED VIEW technical_weekly_latest")

    def run(self, filter_symbols: Optional[List[str]] = None, dry_run: bool = False) -> Dict[str, Any]:
        """Execute the weekly technicals ETL pipeline"""
        logger.info("="*60)
        logger.info("WEEKLY TECHNICALS ETL - START")
        logger.info("="*60)

        start_time = datetime.now()

        symbols = self.get_symbols(filter_symbols)
        if not symbols:
            logger.error("No symbols found")
            return {"success": False, "error": "No symbols"}

        total_inserted = 0
        symbols_updated = 0

        for i, symbol in enumerate(symbols, 1):
            try:
                df = self.load_weekly_bars(symbol, weeks=120)
                if df.empty:
                    continue

                tech_df = self.compute_technicals(df)
                if tech_df.empty:
                    continue

                count = self.upsert_technicals(tech_df, dry_run=dry_run)
                total_inserted += count
                symbols_updated += 1

                if i % 100 == 0:
                    logger.info(f"Processed {i}/{len(symbols)} symbols...")

            except Exception as e:
                logger.error(f"Error processing {symbol}: {e}")
                continue

        # Refresh materialized view
        if symbols_updated > 0:
            self.refresh_materialized_view(dry_run=dry_run)

        # Get statistics
        stats = self.get_statistics(dry_run=dry_run)

        elapsed = (datetime.now() - start_time).total_seconds()

        result = {
            "success": True,
            "symbols_updated": symbols_updated,
            "technicals_upserted": total_inserted,
            "elapsed_seconds": elapsed,
            **stats
        }

        logger.info("="*60)
        logger.info(f"✅ Symbols updated: {symbols_updated:,}")
        logger.info(f"✅ Technicals upserted: {total_inserted:,}")
        logger.info(f"📊 Symbols with trend_score_w >= 40: {stats.get('pct_strong_trend', 0):.1f}%")
        logger.info(f"⏱️  Elapsed: {elapsed:.2f}s")
        logger.info("="*60)

        # Show top 10 weekly leaders
        if stats.get('top_10_leaders'):
            logger.info("\n🏆 TOP 10 WEEKLY LEADERS:")
            for rank, leader in enumerate(stats['top_10_leaders'], 1):
                logger.info(f"  {rank}. {leader['symbol']:8s} - Trend Score: {leader['trend_score_w']}")

        return result

    def get_statistics(self, dry_run: bool = False) -> Dict[str, Any]:
        """Get statistics after processing"""
        if dry_run:
            return {"pct_strong_trend": 0.0, "top_10_leaders": []}

        with self.Session() as session:
            # This will be populated by weekly_signals, so return placeholder for now
            return {
                "pct_strong_trend": 0.0,
                "top_10_leaders": []
            }


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Weekly Technicals ETL')
    parser.add_argument('--symbols', type=str, help='Comma-separated symbols to process (default: all)')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode')
    args = parser.parse_args()

    db_dsn = os.getenv('DB_DSN')
    if not db_dsn:
        logger.error("DB_DSN environment variable not set")
        sys.exit(1)

    filter_symbols = args.symbols.split(',') if args.symbols else None

    try:
        etl = WeeklyTechnicalsETL(db_dsn)
        result = etl.run(filter_symbols=filter_symbols, dry_run=args.dry_run)

        if not result['success']:
            sys.exit(1)

    except Exception as e:
        logger.exception(f"Weekly technicals ETL failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
