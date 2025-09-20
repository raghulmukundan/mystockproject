import os
from datetime import datetime, timezone
from typing import List, Optional

import pandas as pd

from src.db.models import SessionLocal, TechJob, TechJobError, TechJobSkip, TechJobSuccess
from .fetch_prices import get_latest_trade_date, get_symbols_for_date, get_cutoff, load_tail_df
from .compute import compute_indicators_tail
from .upsert import upsert_daily as upsert_daily_rows, upsert_latest as upsert_latest_row

# TechnicalDaily schema fields (no derived screener fields here)
DAILY_FIELDS = {
    "symbol", "date", "close", "volume",
    "sma20", "sma50", "sma200",
    "rsi14", "adx14", "atr14",
    "donch20_high", "donch20_low",
    "macd", "macd_signal", "macd_hist",
    "avg_vol20", "high_252",
}


def _ensure_env_defaults():
    """
    Append TECH_* defaults to .env only when BOTH of the following are true:
      - The key is not set in the current process environment (os.environ)
      - The key is not already present in the .env file

    This avoids accidentally overriding values provided via Docker/compose env.
    Safe no-op if .env does not exist or is unreadable.
    """
    env_path = os.path.join(os.getcwd(), ".env")
    defaults = {
        "TECH_TAIL_DAYS": "800",
        "TECH_BUFFER_DAYS": "30",
        "TECH_RUN_TIME": "17:40",
    }
    if not os.path.exists(env_path):
        return
    existing = {}
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    k, v = line.strip().split('=', 1)
                    existing[k.strip()] = v.strip()
    except Exception:
        return  # don't fail if unreadable

    # Only append keys missing from both process env and .env
    to_append = []
    for k, v in defaults.items():
        if os.getenv(k):
            continue  # present in env; respect external config
        if k in existing:
            continue  # present in .env already
        to_append.append((k, v))

    if to_append:
        try:
            with open(env_path, 'a', encoding='utf-8') as f:
                for k, v in to_append:
                    f.write(f"\n{k}={v}\n")
        except Exception:
            pass


def run_technical_compute(symbols: Optional[List[str]] = None) -> dict:
    _ensure_env_defaults()

    tail_days = int(os.getenv("TECH_TAIL_DAYS", "800"))
    buffer_days = int(os.getenv("TECH_BUFFER_DAYS", "30"))
    min_rows = int(os.getenv("TECH_MIN_ROWS", "60"))

    db = SessionLocal()
    job = None
    try:
        latest_trade_date = get_latest_trade_date(db)
        if not latest_trade_date:
            raise RuntimeError("No trade dates found in prices data")

        job = TechJob(
            started_at=datetime.now(timezone.utc).isoformat(),
            status='running',
            latest_trade_date=latest_trade_date,
            total_symbols=0,
            updated_symbols=0,
            daily_rows_upserted=0,
            latest_rows_upserted=0,
            errors=0,
            message='',
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        # Determine symbol set
        if symbols and len(symbols) > 0:
            sym_list = [s.strip().upper() for s in symbols if s and s.strip()]
        else:
            sym_list = get_symbols_for_date(db, latest_trade_date)
        cutoff = get_cutoff(latest_trade_date, tail_days, buffer_days)
        try:
            print(f"[tech] config: latest_trade_date={latest_trade_date} tail_days={tail_days} buffer_days={buffer_days} cutoff={cutoff} min_rows={min_rows}")
        except Exception:
            pass
        
        job.total_symbols = len(sym_list)
        db.commit()

        skipped_empty = 0
        skipped_short_tail = 0
        skipped_no_today = 0

        for sym in sym_list:
            try:
                df = load_tail_df(db, sym, cutoff)
                if df is None or df.empty:
                    skipped_empty += 1
                    try:
                        db.add(TechJobSkip(tech_job_id=job.id, symbol=sym, reason='no_data', detail=f'No price data found since cutoff date {cutoff} (looked in historical_prices and prices_daily tables)'))
                        db.commit()
                    except Exception:
                        db.rollback()
                    continue
                if len(df) < min_rows:
                    skipped_short_tail += 1
                    try:
                        # Check data sources for better diagnostics
                        sources = df['_src'].value_counts().to_dict() if '_src' in df.columns else {}
                        historical_count = sources.get('H', 0)
                        current_count = sources.get('C', 0)
                        date_range = f"{df['date'].min()} to {df['date'].max()}" if not df.empty else "N/A"

                        detail = f'Insufficient data: found {len(df)} rows < required {min_rows} rows. '
                        detail += f'Historical: {historical_count}, Current: {current_count}. '
                        detail += f'Date range: {date_range}. '
                        detail += f'Cutoff: {cutoff}'

                        db.add(TechJobSkip(tech_job_id=job.id, symbol=sym, reason='insufficient_data', detail=detail))
                        db.commit()
                    except Exception:
                        db.rollback()
                    continue
                
                df2 = compute_indicators_tail(df)
                # select latest row (for latest table)
                last_row = df2.iloc[-1]
                if str(last_row["date"]) != latest_trade_date:
                    # Only act for today's trade date
                    skipped_no_today += 1
                    try:
                        detail = f'Missing current trading day data: last available date is {last_row["date"]}, but expected {latest_trade_date}. '
                        detail += f'This symbol may not have traded on the latest trading day or data is delayed.'

                        db.add(TechJobSkip(tech_job_id=job.id, symbol=sym, reason='stale_data', detail=detail))
                        db.commit()
                    except Exception:
                        db.rollback()
                    continue
                # Build row dicts
                latest = {
                    "symbol": sym,
                    "date": str(last_row["date"]),
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
                upsert_latest_row(db, latest)
                job.latest_rows_upserted += 1

                # Upsert into daily only if not present (filter to TechnicalDaily columns)
                daily = {k: v for k, v in latest.items() if k in DAILY_FIELDS}
                count = upsert_daily_rows(db, [daily])
                job.daily_rows_upserted += count
                job.updated_symbols += 1
                try:
                    db.add(TechJobSuccess(tech_job_id=job.id, symbol=sym, date=latest_trade_date))
                    db.commit()
                except Exception:
                    db.rollback()
            except Exception as e:
                job.errors += 1
                job.message = str(e)
                # Log once in server logs for visibility
                try:
                    print(f"[tech] {sym}: {e}")
                except Exception:
                    pass
                try:
                    # Add both error and skip records for better tracking
                    err = TechJobError(tech_job_id=job.id, symbol=sym, error_message=str(e))
                    db.add(err)

                    # Also add skip record with more context
                    skip_detail = f'Processing error: {str(e)}. This could be due to data quality issues, calculation errors, or unexpected data format.'
                    skip = TechJobSkip(tech_job_id=job.id, symbol=sym, reason='processing_error', detail=skip_detail)
                    db.add(skip)
                except Exception:
                    pass
                db.commit()
                continue

        job.status = 'success' if job.errors == 0 else ('partial' if job.updated_symbols > 0 else 'failed')
        job.finished_at = datetime.now(timezone.utc).isoformat()
        db.commit()

        # Log a short summary for visibility
        try:
            print(f"[tech] summary: total={job.total_symbols} updated={job.updated_symbols} skipped_no_data={skipped_empty} skipped_insufficient={skipped_short_tail} skipped_stale={skipped_no_today} errors={job.errors}")
        except Exception:
            pass

        return {
            "job_id": job.id,
            "latest_trade_date": latest_trade_date,
            "total_symbols": job.total_symbols,
            "updated_symbols": job.updated_symbols,
            "daily_rows_upserted": job.daily_rows_upserted,
            "latest_rows_upserted": job.latest_rows_upserted,
            "errors": job.errors,
            "skipped_empty": skipped_empty,
            "skipped_short_tail": skipped_short_tail,
            "skipped_no_today": skipped_no_today,
        }
    finally:
        db.close()


def _to_float(x):
    try:
        if pd.isna(x):
            return None
        return float(x)
    except Exception:
        return None
