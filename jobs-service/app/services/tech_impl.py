"""
Technical analysis implementation for jobs-service
"""
import os
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

# Disable numba acceleration to avoid compilation errors
os.environ["NUMBA_DISABLE_JIT"] = "1"

import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.services.job_status import begin_job, complete_job, fail_job, prune_history, update_job_progress
from app.db.models import TechJob, TechJobError, TechJobSkip, TechJobSuccess

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
    data_length = len(df)

    # Adaptive periods based on available data
    sma20_period = min(20, max(5, int(data_length // 2)))
    sma50_period = min(50, max(10, int(data_length // 1.5)))
    sma200_period = min(200, max(20, int(data_length)))

    atr_period = min(14, max(3, int(data_length // 3)))
    rsi_period = min(14, max(3, int(data_length // 3)))
    adx_period = min(14, max(3, int(data_length // 3)))

    donch_period = min(20, max(5, int(data_length // 2)))
    vol_period = min(20, max(5, data_length // 2))
    high_period = min(252, max(20, data_length))

    logger.info(f"Computing indicators for {data_length} rows: SMA({sma20_period},{sma50_period},{sma200_period}) RSI({rsi_period}) ADX({adx_period})")

    # Compute SMAs with adaptive periods
    out["sma20"]  = ta.sma(out["close"], length=sma20_period) if data_length >= 5 else np.nan
    out["sma50"]  = ta.sma(out["close"], length=sma50_period) if data_length >= 10 else np.nan
    out["sma200"] = ta.sma(out["close"], length=sma200_period) if data_length >= 20 else np.nan

    # Compute other indicators with adaptive periods
    out["atr14"]  = ta.atr(out["high"], out["low"], out["close"], length=atr_period) if data_length >= 3 else np.nan
    out["rsi14"]  = ta.rsi(out["close"], length=rsi_period) if data_length >= 3 else np.nan

    # ADX computation
    if data_length >= 3:
        adx = ta.adx(out["high"], out["low"], out["close"], length=adx_period)
        if adx is not None and not adx.empty:
            out["adx14"] = adx.get(f"ADX_{adx_period}", adx.iloc[:, 0] if len(adx.columns) > 0 else np.nan)
        else:
            out["adx14"] = np.nan
    else:
        out["adx14"] = np.nan

    # Donchian channels
    if data_length >= 5:
        dc = ta.donchian(out["high"], out["low"], lower_length=donch_period, upper_length=donch_period)
        if dc is not None and not dc.empty and len(dc.columns) >= 2:
            out["donch20_high"] = dc.iloc[:, 0]
            out["donch20_low"]  = dc.iloc[:, 1]
        else:
            out["donch20_high"] = np.nan
            out["donch20_low"]  = np.nan
    else:
        out["donch20_high"] = np.nan
        out["donch20_low"]  = np.nan

    # MACD (requires at least 26 periods traditionally, but we'll try with less)
    if data_length >= 10:
        macd_fast = min(12, max(3, data_length // 4))
        macd_slow = min(26, max(6, data_length // 2))
        macd_signal = min(9, max(3, data_length // 6))

        macd = ta.macd(out["close"], fast=macd_fast, slow=macd_slow, signal=macd_signal)
        if macd is not None and not macd.empty:
            out["macd"]        = macd.get(f"MACD_{macd_fast}_{macd_slow}_{macd_signal}", macd.iloc[:, 0] if len(macd.columns) > 0 else np.nan)
            out["macd_signal"] = macd.get(f"MACDs_{macd_fast}_{macd_slow}_{macd_signal}", macd.iloc[:, 1] if len(macd.columns) > 1 else np.nan)
            out["macd_hist"]   = macd.get(f"MACDh_{macd_fast}_{macd_slow}_{macd_signal}", macd.iloc[:, 2] if len(macd.columns) > 2 else np.nan)
        else:
            out["macd"] = np.nan
            out["macd_signal"] = np.nan
            out["macd_hist"] = np.nan
    else:
        out["macd"] = np.nan
        out["macd_signal"] = np.nan
        out["macd_hist"] = np.nan

    # Volume and price metrics with adaptive periods
    out["avg_vol20"] = out["volume"].rolling(vol_period, min_periods=max(1, vol_period // 2)).mean()
    out["high_252"]  = out["close"].rolling(high_period, min_periods=max(1, high_period // 5)).max()

    out["distance_to_52w_high"] = np.where(out["high_252"] > 0, (out["high_252"] - out["close"]) / out["high_252"], np.nan)
    out["rel_volume"] = np.where(out["avg_vol20"] > 0, out["volume"] / out["avg_vol20"], np.nan)
    out["sma_slope"]  = out.get("sma20", np.nan) - out.get("sma50", np.nan) if not pd.isna(out.get("sma20", np.nan)).all() and not pd.isna(out.get("sma50", np.nan)).all() else np.nan

    return out


def get_latest_trade_date(db: Session) -> Optional[str]:
    """Get the latest trade date from unified price data"""
    try:
        result = db.execute(text("SELECT MAX(date) FROM unified_price_data"))
        row = result.fetchone()
        return str(row[0]) if row and row[0] else None
    except Exception:
        return None


def get_symbols_for_date(db: Session, date: str) -> List[str]:
    """Get all symbols that have data for the given date"""
    try:
        result = db.execute(
            text("SELECT DISTINCT symbol FROM unified_price_data WHERE date = :date ORDER BY symbol"),
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
    """Load price data for a symbol from the cutoff date using unified price data"""
    try:
        # Get data from unified view
        result = db.execute(
            text("""
                SELECT date, open, high, low, close, volume, data_source as source
                FROM unified_price_data
                WHERE symbol = :symbol AND date >= :cutoff
                ORDER BY date
            """),
            {"symbol": symbol, "cutoff": cutoff}
        )

        rows = result.fetchall()
        if not rows:
            return None

        df = pd.DataFrame(rows, columns=['date', 'open', 'high', 'low', 'close', 'volume', 'source'])
        df['date'] = pd.to_datetime(df['date'])

        # Remove duplicates, preferring current data over historical for the same date
        df = df.sort_values(['date', 'source']).drop_duplicates(['date'], keep='last')
        df = df.drop('source', axis=1)  # Remove source column
        df.set_index('date', inplace=True)

        logger.info(f"Loaded {len(df)} rows for {symbol} from {df.index[0].date()} to {df.index[-1].date()}")
        return df
    except Exception as e:
        logger.error(f"Error loading data for {symbol}: {str(e)}")
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

def _to_int(x):
    """Convert value to int, handling NaN, None, and floats"""
    try:
        if pd.isna(x):
            return 0  # Default volume to 0 if missing
        return int(float(x))  # Convert to float first, then int to handle '29.0' -> 29
    except Exception:
        return 0


def create_tech_job(db: Session, latest_trade_date: str, total_symbols: int) -> int:
    """Create a new tech job record and return its ID"""
    tech_job = TechJob(
        started_at=datetime.now(timezone.utc).isoformat(),
        status='running',
        latest_trade_date=latest_trade_date,
        total_symbols=total_symbols,
        updated_symbols=0,
        daily_rows_upserted=0,
        latest_rows_upserted=0,
        errors=0
    )
    db.add(tech_job)
    db.commit()
    db.refresh(tech_job)
    return tech_job.id


def update_tech_job_progress(db: Session, job_id: int, **kwargs):
    """Update tech job progress"""
    tech_job = db.query(TechJob).filter(TechJob.id == job_id).first()
    if tech_job:
        for key, value in kwargs.items():
            if hasattr(tech_job, key):
                setattr(tech_job, key, value)
        db.commit()


def complete_tech_job(db: Session, job_id: int, status: str = 'completed', message: str = None):
    """Mark tech job as completed or failed"""
    tech_job = db.query(TechJob).filter(TechJob.id == job_id).first()
    if tech_job:
        tech_job.status = status
        tech_job.finished_at = datetime.now(timezone.utc).isoformat()
        if message:
            tech_job.message = message
        db.commit()


def log_tech_job_error(db: Session, job_id: int, symbol: str, error_message: str):
    """Log an error for a tech job"""
    error = TechJobError(
        tech_job_id=job_id,
        symbol=symbol,
        error_message=error_message
    )
    db.add(error)
    db.commit()


def log_tech_job_skip(db: Session, job_id: int, symbol: str, reason: str, detail: str = None):
    """Log a skip for a tech job"""
    skip = TechJobSkip(
        tech_job_id=job_id,
        symbol=symbol,
        reason=reason,
        detail=detail
    )
    db.add(skip)
    db.commit()


def log_tech_job_success(db: Session, job_id: int, symbol: str, date: str):
    """Log a success for a tech job"""
    success = TechJobSuccess(
        tech_job_id=job_id,
        symbol=symbol,
        date=date
    )
    db.add(success)
    db.commit()


async def run_technical_compute(symbols: Optional[List[str]] = None) -> dict:
    """Run technical analysis computation"""
    job_name = "technical_compute"
    job_id = None
    tech_job_id = None

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

            # Create tech job record
            tech_job_id = create_tech_job(db, latest_trade_date, total_symbols)

            logger.info(f"Processing {total_symbols} symbols for technical analysis")

            for i, sym in enumerate(sym_list):
                if i % 100 == 0:
                    logger.info(f"Processing symbol {i+1}/{total_symbols}: {sym}")
                    # Update progress every 100 symbols
                    update_job_progress(job_id, updated_symbols)
                    # Update tech job progress
                    update_tech_job_progress(db, tech_job_id,
                        updated_symbols=updated_symbols,
                        daily_rows_upserted=daily_rows_upserted,
                        latest_rows_upserted=latest_rows_upserted,
                        errors=errors
                    )

                try:
                    # Load price data
                    df = load_tail_df(db, sym, cutoff)
                    if df is None or df.empty:
                        skipped_empty += 1
                        log_tech_job_skip(db, tech_job_id, sym, "empty_data", "No price data available")
                        continue

                    if len(df) < min_rows:
                        skipped_short_tail += 1
                        log_tech_job_skip(db, tech_job_id, sym, "short_tail", f"Insufficient data: {len(df)} rows < {min_rows} required")
                        continue

                    # Compute technical indicators
                    df2 = compute_indicators_tail(df)

                    # Get latest row
                    last_row = df2.iloc[-1]
                    if str(last_row.name.date()) != latest_trade_date:
                        skipped_no_today += 1
                        log_tech_job_skip(db, tech_job_id, sym, "no_today_data", f"Latest data is {last_row.name.date()} but need {latest_trade_date}")
                        continue

                    # Build latest row dict
                    latest = {
                        "symbol": sym,
                        "date": str(last_row.name.date()),
                        "close": float(last_row["close"]),
                        "volume": _to_int(last_row["volume"]),
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

                    # Log success
                    log_tech_job_success(db, tech_job_id, sym, latest_trade_date)

                except Exception as e:
                    errors += 1
                    error_msg = str(e)
                    logger.error(f"Error processing {sym}: {error_msg}")
                    # Log error to tech job errors table
                    log_tech_job_error(db, tech_job_id, sym, error_msg)
                    continue

            # Complete the tech job with final stats
            update_tech_job_progress(db, tech_job_id,
                updated_symbols=updated_symbols,
                daily_rows_upserted=daily_rows_upserted,
                latest_rows_upserted=latest_rows_upserted,
                errors=errors
            )
            complete_tech_job(db, tech_job_id, 'completed',
                f"Processed {total_symbols} symbols: {updated_symbols} updated, {skipped_empty} empty, {skipped_short_tail} short tail, {skipped_no_today} no today, {errors} errors")

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
                "tech_job_id": tech_job_id,
            }

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Technical analysis failed: {str(e)}")
        if job_id is not None:
            fail_job(job_id, str(e))
            prune_history(job_name, keep=5)
        if tech_job_id is not None:
            try:
                db = next(get_db())
                complete_tech_job(db, tech_job_id, 'failed', str(e))
                db.close()
            except:
                pass
        raise