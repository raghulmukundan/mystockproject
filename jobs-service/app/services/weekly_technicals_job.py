"""
Weekly Technicals ETL Job
Computes weekly technical indicators using pandas-ta
Integrated with jobs-service tracking and error handling
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, List
import pandas as pd
import pandas_ta as ta
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

from app.services.job_status import begin_job, complete_job, fail_job, prune_history, update_job_progress

logger = logging.getLogger(__name__)


class WeeklyTechnicalsJob:
    """Weekly technicals computation job with tracking"""

    def __init__(self, db_dsn: str):
        self.engine = create_engine(db_dsn, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine)
        self.job_id = None

    def get_weekly_bars(self) -> pd.DataFrame:
        """Load weekly bars from database"""
        query = text("""
            SELECT symbol, week_end, open, high, low, close, volume
            FROM weekly_bars
            WHERE week_end >= CURRENT_DATE - INTERVAL '150 weeks'
            ORDER BY symbol, week_end
        """)

        with self.Session() as session:
            df = pd.read_sql(query, session.connection())

        logger.info(f"Loaded {len(df)} weekly bars")
        return df

    def compute_sma_slope(self, sma_series: pd.Series, window: int = 4) -> float:
        """Compute SMA slope using linear regression"""
        if len(sma_series) < window:
            return None

        recent = sma_series.tail(window).dropna()
        if len(recent) < 2:
            return None

        x = np.arange(len(recent))
        y = recent.values
        slope = np.polyfit(x, y, 1)[0]
        return float(slope)

    def compute_technicals_for_symbol(self, symbol_df: pd.DataFrame) -> pd.DataFrame:
        """Compute all weekly indicators for one symbol"""
        if len(symbol_df) < 50:
            return pd.DataFrame()

        df = symbol_df.copy()
        df = df.sort_values('week_end')

        # SMAs
        df['sma10w'] = ta.sma(df['close'], length=10)
        df['sma30w'] = ta.sma(df['close'], length=30)
        df['sma40w'] = ta.sma(df['close'], length=40)

        # RSI
        df['rsi14w'] = ta.rsi(df['close'], length=14)

        # ADX
        adx_df = ta.adx(df['high'], df['low'], df['close'], length=14)
        if adx_df is not None and not adx_df.empty:
            df['adx14w'] = adx_df['ADX_14']

        # ATR
        df['atr14w'] = ta.atr(df['high'], df['low'], df['close'], length=14)

        # Donchian Channels
        donchian = ta.donchian(df['high'], df['low'], length=20)
        if donchian is not None and not donchian.empty:
            df['donch20w_high'] = donchian[f'DCU_20_20']
            df['donch20w_low'] = donchian[f'DCL_20_20']

        # MACD
        macd_df = ta.macd(df['close'], fast=12, slow=26, signal=9)
        if macd_df is not None and not macd_df.empty:
            df['macd_w'] = macd_df['MACD_12_26_9']
            df['macd_signal_w'] = macd_df['MACDs_12_26_9']
            df['macd_hist_w'] = macd_df['MACDh_12_26_9']

        # Average volume
        df['avg_vol10w'] = df['volume'].rolling(window=10).mean()

        # 52-week high
        df['high_52w'] = df['high'].rolling(window=52).max()
        df['distance_to_52w_high_w'] = (df['close'] - df['high_52w']) / df['high_52w']

        # SMA slope
        df['sma_w_slope'] = df['sma30w'].rolling(window=10).apply(
            lambda x: self.compute_sma_slope(x, window=4) if len(x) >= 4 else None,
            raw=False
        )

        return df

    def upsert_technicals(self, tech_df: pd.DataFrame) -> Dict[str, int]:
        """Upsert technicals with ON CONFLICT DO UPDATE"""
        if tech_df.empty:
            return {'inserted': 0, 'updated': 0, 'skipped': 0}

        inserted = 0
        updated = 0
        skipped = 0

        with self.Session() as session:
            for _, row in tech_df.iterrows():
                # Skip rows with mostly null values
                if pd.isna(row.get('sma10w')) and pd.isna(row.get('rsi14w')):
                    skipped += 1
                    continue

                # Check if exists
                exists = session.execute(
                    text("""
                        SELECT id FROM technical_weekly
                        WHERE symbol = :symbol AND week_end = :week_end
                    """),
                    {
                        'symbol': row['symbol'],
                        'week_end': row['week_end']
                    }
                ).fetchone()

                params = {
                    'symbol': row['symbol'],
                    'week_end': row['week_end'],
                    'close': float(row['close']) if pd.notna(row.get('close')) else None,
                    'volume': int(row['volume']) if pd.notna(row.get('volume')) else 0,
                    'sma10w': float(row['sma10w']) if pd.notna(row.get('sma10w')) else None,
                    'sma30w': float(row['sma30w']) if pd.notna(row.get('sma30w')) else None,
                    'sma40w': float(row['sma40w']) if pd.notna(row.get('sma40w')) else None,
                    'rsi14w': float(row['rsi14w']) if pd.notna(row.get('rsi14w')) else None,
                    'adx14w': float(row['adx14w']) if pd.notna(row.get('adx14w')) else None,
                    'atr14w': float(row['atr14w']) if pd.notna(row.get('atr14w')) else None,
                    'donch20w_high': float(row['donch20w_high']) if pd.notna(row.get('donch20w_high')) else None,
                    'donch20w_low': float(row['donch20w_low']) if pd.notna(row.get('donch20w_low')) else None,
                    'macd_w': float(row['macd_w']) if pd.notna(row.get('macd_w')) else None,
                    'macd_signal_w': float(row['macd_signal_w']) if pd.notna(row.get('macd_signal_w')) else None,
                    'macd_hist_w': float(row['macd_hist_w']) if pd.notna(row.get('macd_hist_w')) else None,
                    'avg_vol10w': float(row['avg_vol10w']) if pd.notna(row.get('avg_vol10w')) else None,
                    'high_52w': float(row['high_52w']) if pd.notna(row.get('high_52w')) else None,
                    'distance_to_52w_high_w': float(row['distance_to_52w_high_w']) if pd.notna(row.get('distance_to_52w_high_w')) else None,
                    'sma_w_slope': float(row['sma_w_slope']) if pd.notna(row.get('sma_w_slope')) else None,
                }

                if exists:
                    session.execute(
                        text("""
                            UPDATE technical_weekly
                            SET close = :close, volume = :volume,
                                sma10w = :sma10w, sma30w = :sma30w, sma40w = :sma40w,
                                rsi14w = :rsi14w, adx14w = :adx14w, atr14w = :atr14w,
                                donch20w_high = :donch20w_high, donch20w_low = :donch20w_low,
                                macd_w = :macd_w, macd_signal_w = :macd_signal_w, macd_hist_w = :macd_hist_w,
                                avg_vol10w = :avg_vol10w, high_52w = :high_52w,
                                distance_to_52w_high_w = :distance_to_52w_high_w, sma_w_slope = :sma_w_slope
                            WHERE symbol = :symbol AND week_end = :week_end
                        """),
                        params
                    )
                    updated += 1
                else:
                    session.execute(
                        text("""
                            INSERT INTO technical_weekly
                            (symbol, week_end, close, volume, sma10w, sma30w, sma40w, rsi14w, adx14w, atr14w,
                             donch20w_high, donch20w_low, macd_w, macd_signal_w, macd_hist_w,
                             avg_vol10w, high_52w, distance_to_52w_high_w, sma_w_slope)
                            VALUES (:symbol, :week_end, :close, :volume, :sma10w, :sma30w, :sma40w, :rsi14w, :adx14w, :atr14w,
                                    :donch20w_high, :donch20w_low, :macd_w, :macd_signal_w, :macd_hist_w,
                                    :avg_vol10w, :high_52w, :distance_to_52w_high_w, :sma_w_slope)
                        """),
                        params
                    )
                    inserted += 1

                # Update progress
                if (inserted + updated) % 50 == 0 and self.job_id:
                    update_job_progress(self.job_id, inserted + updated)

            session.commit()

        logger.info(f"Upserted technicals: {inserted} inserted, {updated} updated, {skipped} skipped")
        return {'inserted': inserted, 'updated': updated, 'skipped': skipped}

    def refresh_materialized_view(self):
        """Refresh technical_weekly_latest materialized view"""
        with self.Session() as session:
            session.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY technical_weekly_latest"))
            session.commit()
        logger.info("Refreshed technical_weekly_latest materialized view")

    async def run(self) -> Dict[str, Any]:
        """Execute weekly technicals job"""
        try:
            # Load weekly bars
            weekly_df = self.get_weekly_bars()
            if weekly_df.empty:
                logger.warning("No weekly bars found")
                return {'success': True, 'symbols_processed': 0}

            symbols = weekly_df['symbol'].unique()
            logger.info(f"Processing {len(symbols)} symbols")

            all_technicals = []
            processed = 0
            errors = 0

            for symbol in symbols:
                try:
                    symbol_df = weekly_df[weekly_df['symbol'] == symbol]
                    tech_df = self.compute_technicals_for_symbol(symbol_df)

                    if not tech_df.empty:
                        all_technicals.append(tech_df)

                    processed += 1

                    # Update progress every 100 symbols
                    if processed % 100 == 0:
                        logger.info(f"Processed {processed}/{len(symbols)} symbols")
                        if self.job_id:
                            update_job_progress(self.job_id, processed)

                except Exception as e:
                    logger.error(f"Error processing {symbol}: {str(e)}")
                    errors += 1

            # Combine all results
            if all_technicals:
                combined_df = pd.concat(all_technicals, ignore_index=True)
                stats = self.upsert_technicals(combined_df)
            else:
                stats = {'inserted': 0, 'updated': 0, 'skipped': 0}

            # Refresh materialized view
            self.refresh_materialized_view()

            return {
                'success': True,
                'symbols_processed': processed,
                'symbols_errors': errors,
                'inserted': stats['inserted'],
                'updated': stats['updated'],
                'skipped': stats['skipped']
            }

        except Exception as e:
            logger.error(f"Weekly technicals job failed: {str(e)}")
            raise


def run_weekly_technicals_job_scheduled():
    """Wrapper for scheduled execution"""
    asyncio.run(run_weekly_technicals_job())


async def run_weekly_technicals_job(job_id: int = None):
    """Run weekly technicals ETL job with tracking"""
    job_name = "weekly_technicals_etl"

    try:
        logger.info(f"🚀 JOB START: {job_name} - Beginning weekly technicals computation")
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
        job = WeeklyTechnicalsJob(db_dsn)
        job.job_id = job_id
        result = await job.run()

        # Mark complete
        complete_job(job_id, records_processed=result.get('symbols_processed', 0))
        prune_history(job_name, keep=5)

        logger.info(f"✅ JOB COMPLETE: {job_name} - {result['symbols_processed']} symbols, {result['inserted']} inserted, {result['updated']} updated")

        # Trigger weekly signals computation after weekly technicals completes
        logger.info("🔗 CHAINING: Triggering weekly_signals_computation after weekly_technicals completion")
        from app.services.weekly_signals_job import run_weekly_signals_job
        try:
            await run_weekly_signals_job()
            logger.info("✅ CHAINING: weekly_signals_computation completed successfully")
        except Exception as chain_error:
            logger.error(f"❌ CHAINING: weekly_signals_computation failed: {str(chain_error)}")

        return result

    except Exception as e:
        logger.error(f"❌ JOB FAILED: {job_name} - {str(e)}")
        if job_id:
            fail_job(job_id, str(e))
            logger.info(f"📝 JOB TRACKING: {job_name} - Job ID {job_id} marked as failed")
        raise
