"""
Technical analysis implementation for jobs-service
"""
import os
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.services.job_status import begin_job, complete_job, fail_job, prune_history

try:
    import pandas_ta as ta  # type: ignore
except Exception:
    ta = None

logger = logging.getLogger(__name__)

# TechnicalDaily schema fields (no derived screener fields here)
DAILY_FIELDS = {
    "symbol", "date", "close", "volume",
    "sma20", "sma50", "sma200",
    "rsi14", "adx14", "atr14",
    "donch20_high", "donch20_low",
    "macd", "macd_signal", "macd_hist",
    "avg_vol20", "high_252",
}


def compute_indicators_tail(df: pd.DataFrame) -> pd.DataFrame:
    """Compute technical indicators for the tail of price data"""
    if ta is None:
        raise RuntimeError(
            "pandas-ta is required. Install with: pip install \"pandas-ta==0.3.14b0\" (Py3.8-3.11) or pip install --pre \"pandas-ta>=0.4.67b0\" (Py3.12+)."
        )

    out = df.copy()

    out["sma20"]  = ta.sma(out["close"], length=20)
    out["sma50"]  = ta.sma(out["close"], length=50)
    out["sma200"] = ta.sma(out["close"], length=200)

    out["atr14"]  = ta.atr(out["high"], out["low"], out["close"], length=14)
    out["rsi14"]  = ta.rsi(out["close"], length=14)
    adx = ta.adx(out["high"], out["low"], out["close"], length=14)
    out["adx14"]  = adx.get("ADX_14", adx.iloc[:, 0])

    dc = ta.donchian(out["high"], out["low"], lower_length=20, upper_length=20)
    out["donch20_high"] = dc.iloc[:, 0]
    out["donch20_low"]  = dc.iloc[:, 1]

    macd = ta.macd(out["close"])  # 12,26,9
    out["macd"]        = macd.get("MACD_12_26_9", macd.iloc[:, 0])
    out["macd_signal"] = macd.get("MACDs_12_26_9", macd.iloc[:, 1])
    out["macd_hist"]   = macd.get("MACDh_12_26_9", macd.iloc[:, 2])

    out["avg_vol20"] = out["volume"].rolling(20, min_periods=20).mean()
    out["high_252"]  = out["close"].rolling(252, min_periods=252).max()

    out["distance_to_52w_high"] = np.where(out["high_252"] > 0, (out["high_252"] - out["close"]) / out["high_252"], np.nan)
    out["rel_volume"] = np.where(out["avg_vol20"] > 0, out["volume"] / out["avg_vol20"], np.nan)
    out["sma_slope"]  = out["sma20"] - out["sma50"]

    return out


def get_latest_trade_date(db: Session) -> Optional[str]:
    """Get the latest trade date from daily_ohlc_prices"""
    try:
        result = db.execute(text("SELECT MAX(date) FROM daily_ohlc_prices"))
        row = result.fetchone()
        return str(row[0]) if row and row[0] else None
    except Exception:
        return None


def get_symbols_for_date(db: Session, date: str) -> List[str]:
    """Get all symbols that have data for the given date"""
    try:
        result = db.execute(
            text("SELECT DISTINCT symbol FROM daily_ohlc_prices WHERE date = :date ORDER BY symbol"),
            {"date": date}
        )
        return [row[0] for row in result.fetchall()]
    except Exception:
        return []


def get_cutoff(latest_trade_date: str, tail_days: int, buffer_days: int) -> str:
    """Calculate the cutoff date for loading price data"""
    from datetime import datetime, timedelta

    try:
        latest_dt = datetime.strptime(latest_trade_date, "%Y-%m-%d")
        cutoff_dt = latest_dt - timedelta(days=tail_days + buffer_days)
        return cutoff_dt.strftime("%Y-%m-%d")
    except Exception:
        # Fallback
        return "2020-01-01"


def load_tail_df(db: Session, symbol: str, cutoff: str) -> Optional[pd.DataFrame]:
    """Load price data for a symbol from the cutoff date"""
    try:
        result = db.execute(
            text("""
                SELECT date, open, high, low, close, volume
                FROM daily_ohlc_prices
                WHERE symbol = :symbol AND date >= :cutoff
                ORDER BY date
            """),
            {"symbol": symbol, "cutoff": cutoff}
        )

        rows = result.fetchall()
        if not rows:
            return None

        df = pd.DataFrame(rows, columns=['date', 'open', 'high', 'low', 'close', 'volume'])
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)

        return df
    except Exception:
        return None


def upsert_latest_row(db: Session, latest: dict):
    """Upsert a row into technical_latest table"""
    try:
        # Delete existing row for this symbol
        db.execute(
            text("DELETE FROM technical_latest WHERE symbol = :symbol"),
            {"symbol": latest["symbol"]}
        )

        # Insert new row
        db.execute(
            text("""
                INSERT INTO technical_latest (
                    symbol, date, close, volume, sma20, sma50, sma200,
                    rsi14, adx14, atr14, donch20_high, donch20_low,
                    macd, macd_signal, macd_hist, avg_vol20, high_252,
                    distance_to_52w_high, rel_volume, sma_slope
                ) VALUES (
                    :symbol, :date, :close, :volume, :sma20, :sma50, :sma200,
                    :rsi14, :adx14, :atr14, :donch20_high, :donch20_low,
                    :macd, :macd_signal, :macd_hist, :avg_vol20, :high_252,
                    :distance_to_52w_high, :rel_volume, :sma_slope
                )
            """),
            latest
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise e


def upsert_daily_rows(db: Session, daily_rows: List[dict]) -> int:
    """Upsert rows into technical_daily table, return count of inserted rows"""
    count = 0
    for daily in daily_rows:
        try:
            # Check if row already exists
            result = db.execute(
                text("SELECT 1 FROM technical_daily WHERE symbol = :symbol AND date = :date"),
                {"symbol": daily["symbol"], "date": daily["date"]}
            )

            if result.fetchone():
                continue  # Skip if already exists

            # Insert new row
            db.execute(
                text("""
                    INSERT INTO technical_daily (
                        symbol, date, close, volume, sma20, sma50, sma200,
                        rsi14, adx14, atr14, donch20_high, donch20_low,
                        macd, macd_signal, macd_hist, avg_vol20, high_252
                    ) VALUES (
                        :symbol, :date, :close, :volume, :sma20, :sma50, :sma200,
                        :rsi14, :adx14, :atr14, :donch20_high, :donch20_low,
                        :macd, :macd_signal, :macd_hist, :avg_vol20, :high_252
                    )
                """),
                daily
            )
            count += 1
        except Exception:
            db.rollback()
            continue

    db.commit()
    return count


def _to_float(x):
    """Convert value to float, handling NaN and None"""
    try:
        if pd.isna(x):
            return None
        return float(x)
    except Exception:
        return None


async def run_technical_compute(symbols: Optional[List[str]] = None) -> dict:
    """Run technical analysis computation"""
    job_name = "technical_compute"
    job_id = None

    try:
        logger.info("Starting technical analysis computation")
        job_id = begin_job(job_name)

        # Configuration
        tail_days = int(os.getenv("TECH_TAIL_DAYS", "800"))
        buffer_days = int(os.getenv("TECH_BUFFER_DAYS", "30"))
        min_rows = int(os.getenv("TECH_MIN_ROWS", "60"))

        db = next(get_db())
        try:
            # Get latest trade date
            latest_trade_date = get_latest_trade_date(db)
            if not latest_trade_date:
                raise RuntimeError("No trade dates found in prices data")

            logger.info(f"Technical analysis config: latest_trade_date={latest_trade_date} tail_days={tail_days} buffer_days={buffer_days} min_rows={min_rows}")

            # Determine symbol set
            if symbols and len(symbols) > 0:
                sym_list = [s.strip().upper() for s in symbols if s and s.strip()]
            else:
                sym_list = get_symbols_for_date(db, latest_trade_date)

            cutoff = get_cutoff(latest_trade_date, tail_days, buffer_days)

            total_symbols = len(sym_list)
            updated_symbols = 0
            daily_rows_upserted = 0
            latest_rows_upserted = 0
            errors = 0
            skipped_empty = 0
            skipped_short_tail = 0
            skipped_no_today = 0

            logger.info(f"Processing {total_symbols} symbols for technical analysis")

            for i, sym in enumerate(sym_list):
                if i % 100 == 0:
                    logger.info(f"Processing symbol {i+1}/{total_symbols}: {sym}")

                try:
                    # Load price data
                    df = load_tail_df(db, sym, cutoff)
                    if df is None or df.empty:
                        skipped_empty += 1
                        continue

                    if len(df) < min_rows:
                        skipped_short_tail += 1
                        continue

                    # Compute technical indicators
                    df2 = compute_indicators_tail(df)

                    # Get latest row
                    last_row = df2.iloc[-1]
                    if str(last_row.name.date()) != latest_trade_date:
                        skipped_no_today += 1
                        continue

                    # Build latest row dict
                    latest = {
                        "symbol": sym,
                        "date": str(last_row.name.date()),
                        "close": float(last_row["close"]),
                        "volume": int(last_row["volume"]),
                        "sma20": _to_float(last_row.get("sma20")),
                        "sma50": _to_float(last_row.get("sma50")),
                        "sma200": _to_float(last_row.get("sma200")),
                        "rsi14": _to_float(last_row.get("rsi14")),
                        "adx14": _to_float(last_row.get("adx14")),
                        "atr14": _to_float(last_row.get("atr14")),
                        "donch20_high": _to_float(last_row.get("donch20_high")),
                        "donch20_low": _to_float(last_row.get("donch20_low")),
                        "macd": _to_float(last_row.get("macd")),
                        "macd_signal": _to_float(last_row.get("macd_signal")),
                        "macd_hist": _to_float(last_row.get("macd_hist")),
                        "avg_vol20": _to_float(last_row.get("avg_vol20")),
                        "high_252": _to_float(last_row.get("high_252")),
                        "distance_to_52w_high": _to_float(last_row.get("distance_to_52w_high")),
                        "rel_volume": _to_float(last_row.get("rel_volume")),
                        "sma_slope": _to_float(last_row.get("sma_slope")),
                    }

                    # Upsert to latest table
                    upsert_latest_row(db, latest)
                    latest_rows_upserted += 1

                    # Upsert to daily table (only fields in DAILY_FIELDS)
                    daily = {k: v for k, v in latest.items() if k in DAILY_FIELDS}
                    count = upsert_daily_rows(db, [daily])
                    daily_rows_upserted += count

                    updated_symbols += 1

                except Exception as e:
                    errors += 1
                    logger.error(f"Error processing {sym}: {str(e)}")
                    continue

            # Complete the job
            complete_job(job_id, records_processed=updated_symbols)
            prune_history(job_name, keep=5)

            logger.info(f"Technical analysis completed: total={total_symbols} updated={updated_symbols} skipped_empty={skipped_empty} skipped_short_tail={skipped_short_tail} skipped_no_today={skipped_no_today} errors={errors}")

            return {
                "latest_trade_date": latest_trade_date,
                "total_symbols": total_symbols,
                "updated_symbols": updated_symbols,
                "daily_rows_upserted": daily_rows_upserted,
                "latest_rows_upserted": latest_rows_upserted,
                "errors": errors,
                "skipped_empty": skipped_empty,
                "skipped_short_tail": skipped_short_tail,
                "skipped_no_today": skipped_no_today,
            }

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Technical analysis failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        raise