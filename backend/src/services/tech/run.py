import os
from datetime import datetime, timezone
from typing import List, Optional

import pandas as pd

from src.db.models import SessionLocal, TechJob, TechJobError
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
    """Append TECH_* defaults to .env if keys are missing. Safe no-op if .env not present."""
    env_path = os.path.join(os.getcwd(), ".env")
    defaults = {
        "TECH_TAIL_DAYS": "260",
        "TECH_BUFFER_DAYS": "10",
        "TECH_RUN_TIME": "17:40",
    }
    existing = {}
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    if '=' in line and not line.strip().startswith('#'):
                        k, v = line.strip().split('=', 1)
                        existing[k.strip()] = v.strip()
        except Exception:
            return  # don't fail if unreadable
        missing = [k for k in defaults if k not in existing]
        if missing:
            try:
                with open(env_path, 'a', encoding='utf-8') as f:
                    for k in missing:
                        f.write(f"\n{k}={defaults[k]}\n")
            except Exception:
                pass


def run_technical_compute(symbols: Optional[List[str]] = None) -> dict:
    _ensure_env_defaults()

    tail_days = int(os.getenv("TECH_TAIL_DAYS", "260"))
    buffer_days = int(os.getenv("TECH_BUFFER_DAYS", "10"))

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

        job.total_symbols = len(sym_list)
        db.commit()

        for sym in sym_list:
            try:
                df = load_tail_df(db, sym, cutoff)
                if df is None or df.empty or len(df) < 60:
                    continue
                df2 = compute_indicators_tail(df)
                # select latest row (for latest table)
                last_row = df2.iloc[-1]
                if str(last_row["date"]) != latest_trade_date:
                    # Only act for today's trade date
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
                db.commit()
            except Exception as e:
                job.errors += 1
                job.message = str(e)
                # Log once in server logs for visibility
                try:
                    print(f"[tech] {sym}: {e}")
                except Exception:
                    pass
                try:
                    err = TechJobError(tech_job_id=job.id, symbol=sym, error_message=str(e))
                    db.add(err)
                except Exception:
                    pass
                db.commit()
                continue

        job.status = 'success' if job.errors == 0 else ('partial' if job.updated_symbols > 0 else 'failed')
        job.finished_at = datetime.now(timezone.utc).isoformat()
        db.commit()

        return {
            "job_id": job.id,
            "latest_trade_date": latest_trade_date,
            "total_symbols": job.total_symbols,
            "updated_symbols": job.updated_symbols,
            "daily_rows_upserted": job.daily_rows_upserted,
            "latest_rows_upserted": job.latest_rows_upserted,
            "errors": job.errors,
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
