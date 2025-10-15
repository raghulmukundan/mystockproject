#!/usr/bin/env python3
"""
Daily Signals Job

Computes daily signal flags using SQL LAG for cross detection.
Calculates trend scores and proposed trade levels.
Runs after daily technical indicators are computed.

Schedule: Daily at 17:40 CT (after Schwab EOD import and technical compute)

Usage:
    python jobs/daily_signals_job.py [--dry-run]

Environment:
    DB_DSN: PostgreSQL connection string
    DAILY_JOB_TIME_CT: 17:40 (default)
"""

import os
import sys
import logging
from datetime import datetime
from typing import Dict, Any, List
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class DailySignalsJob:
    """Computes daily signals and proposed trade setups"""

    def __init__(self, db_dsn: str):
        self.engine = create_engine(db_dsn, pool_pre_ping=True)
        self.Session = sessionmaker(bind=self.engine)

    def load_sql_script(self) -> str:
        """Load the daily signals SQL script"""
        sql_file = Path(__file__).parent.parent / "sql" / "daily_signals_upsert.sql"

        if not sql_file.exists():
            raise FileNotFoundError(f"SQL script not found: {sql_file}")

        with open(sql_file, 'r') as f:
            return f.read()

    def execute_signals_computation(self, dry_run: bool = False) -> Dict[str, Any]:
        """Execute the daily signals SQL script"""
        if dry_run:
            logger.info("[DRY RUN] Would execute daily signals computation")
            return {
                "success": True,
                "dry_run": True,
                "signals_computed": 0
            }

        sql_script = self.load_sql_script()

        with self.Session() as session:
            # Execute the SQL script
            session.execute(text(sql_script))
            session.commit()

        logger.info("✅ Daily signals computation complete")

        return {"success": True, "dry_run": False}

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

    def get_top_breakouts(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get top daily breakouts by trend score"""
        query = text("""
            SELECT
                symbol,
                date,
                trend_score_d,
                sma20_cross_50_up,
                price_above_200,
                macd_cross_up,
                donch20_breakout,
                high_tight_zone,
                proposed_entry,
                proposed_stop,
                target1,
                target2,
                risk_reward_ratio,
                notes
            FROM signals_daily_latest
            WHERE trend_score_d >= 30  -- Minimum threshold for display
            ORDER BY trend_score_d DESC, donch20_breakout DESC, symbol
            LIMIT :limit
        """)

        with self.Session() as session:
            result = session.execute(query, {"limit": limit})
            rows = result.fetchall()

        breakouts = []
        for row in rows:
            breakouts.append({
                "symbol": row.symbol,
                "date": row.date.strftime('%Y-%m-%d'),
                "trend_score_d": row.trend_score_d,
                "sma20_cross_50_up": row.sma20_cross_50_up,
                "price_above_200": row.price_above_200,
                "macd_cross_up": row.macd_cross_up,
                "donch20_breakout": row.donch20_breakout,
                "high_tight_zone": row.high_tight_zone,
                "proposed_entry": float(row.proposed_entry) if row.proposed_entry else None,
                "proposed_stop": float(row.proposed_stop) if row.proposed_stop else None,
                "target1": float(row.target1) if row.target1 else None,
                "target2": float(row.target2) if row.target2 else None,
                "risk_reward_ratio": float(row.risk_reward_ratio) if row.risk_reward_ratio else None,
                "notes": row.notes
            })

        return breakouts

    def get_active_trade_setups(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get active trade setups with entry/stop/targets"""
        query = text("""
            SELECT
                symbol,
                date,
                trend_score_d,
                donch20_breakout,
                proposed_entry,
                proposed_stop,
                target1,
                target2,
                risk_reward_ratio,
                notes
            FROM signals_daily_latest
            WHERE proposed_entry IS NOT NULL
            ORDER BY trend_score_d DESC, risk_reward_ratio DESC NULLS LAST
            LIMIT :limit
        """)

        with self.Session() as session:
            result = session.execute(query, {"limit": limit})
            rows = result.fetchall()

        setups = []
        for row in rows:
            setups.append({
                "symbol": row.symbol,
                "date": row.date.strftime('%Y-%m-%d'),
                "trend_score_d": row.trend_score_d,
                "donch20_breakout": row.donch20_breakout,
                "entry": float(row.proposed_entry),
                "stop": float(row.proposed_stop),
                "target1": float(row.target1),
                "target2": float(row.target2) if row.target2 else None,
                "r_r_ratio": float(row.risk_reward_ratio) if row.risk_reward_ratio else None,
                "notes": row.notes
            })

        return setups

    def run(self, dry_run: bool = False) -> Dict[str, Any]:
        """Execute the daily signals job"""
        logger.info("="*60)
        logger.info("DAILY SIGNALS JOB - START")
        logger.info("="*60)

        start_time = datetime.now()

        # Step 1: Execute signals computation
        result = self.execute_signals_computation(dry_run=dry_run)

        if not result["success"]:
            logger.error("Daily signals computation failed")
            return result

        if dry_run:
            logger.info("[DRY RUN] Skipping statistics and reporting")
            return result

        # Step 2: Get statistics
        stats = self.get_statistics()

        # Step 3: Get top breakouts
        top_breakouts = self.get_top_breakouts(limit=10)

        # Step 4: Get active trade setups
        trade_setups = self.get_active_trade_setups(limit=10)

        elapsed = (datetime.now() - start_time).total_seconds()

        result = {
            "success": True,
            "elapsed_seconds": elapsed,
            **stats,
            "top_breakouts": top_breakouts,
            "trade_setups": trade_setups
        }

        # ============================================================
        # Print summary report
        # ============================================================
        logger.info("="*60)
        logger.info("DAILY SIGNALS SUMMARY")
        logger.info("="*60)
        logger.info(f"Total symbols processed: {stats['total_symbols']:,}")
        logger.info(f"Strong trend (score >= 40): {stats['strong_trend_count']:,} ({stats['pct_strong_trend']:.1f}%)")
        logger.info(f"Donchian breakouts: {stats['breakout_count']:,}")
        logger.info(f"MACD crosses up: {stats['macd_cross_count']:,}")
        logger.info(f"SMA20/50 crosses up: {stats['sma_cross_count']:,}")
        logger.info(f"Trade setups generated: {stats['trade_setups_count']:,}")
        logger.info(f"Elapsed time: {elapsed:.2f}s")
        logger.info("="*60)

        # Print top 10 breakouts
        if top_breakouts:
            logger.info("\n" + "="*60)
            logger.info("🏆 TOP 10 DAILY BREAKOUTS (by Trend Score)")
            logger.info("="*60)
            for i, b in enumerate(top_breakouts, 1):
                signals = []
                if b['donch20_breakout']: signals.append('DONCH')
                if b['macd_cross_up']: signals.append('MACD↑')
                if b['sma20_cross_50_up']: signals.append('SMA↑')
                if b['price_above_200']: signals.append('200+')
                if b['high_tight_zone']: signals.append('HTZ')

                logger.info(f"  {i:2d}. {b['symbol']:8s} | Score: {b['trend_score_d']:2d} | {', '.join(signals)}")

        # Print active trade setups
        if trade_setups:
            logger.info("\n" + "="*60)
            logger.info("📊 ACTIVE TRADE SETUPS (with Entry/Stop/Targets)")
            logger.info("="*60)
            logger.info(f"{'Symbol':<8} {'Entry':>8} {'Stop':>8} {'Tgt1':>8} {'R/R':>6} {'Notes'}")
            logger.info("-"*60)
            for setup in trade_setups:
                rr = f"{setup['r_r_ratio']:.1f}" if setup['r_r_ratio'] else "—"
                notes = (setup['notes'][:30] + '...') if setup.get('notes') and len(setup['notes']) > 30 else (setup.get('notes') or '')
                logger.info(
                    f"{setup['symbol']:<8} "
                    f"{setup['entry']:>8.2f} "
                    f"{setup['stop']:>8.2f} "
                    f"{setup['target1']:>8.2f} "
                    f"{rr:>6} "
                    f"{notes}"
                )

        logger.info("\n" + "="*60)
        logger.info("✅ DAILY SIGNALS JOB COMPLETE")
        logger.info("="*60)

        return result


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Daily Signals Job')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode (no database writes)')
    args = parser.parse_args()

    # Get DB DSN from environment
    db_dsn = os.getenv('DB_DSN')
    if not db_dsn:
        logger.error("DB_DSN environment variable not set")
        sys.exit(1)

    try:
        job = DailySignalsJob(db_dsn)
        result = job.run(dry_run=args.dry_run)

        if not result['success']:
            sys.exit(1)

    except Exception as e:
        logger.exception(f"Daily signals job failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
