from datetime import datetime, timedelta
from typing import List, Optional

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

from src.db.models import SessionLocal


def _to_date(d: str) -> datetime:
    return datetime.strptime(d, "%Y-%m-%d")


def get_latest_trade_date(db: Session) -> Optional[str]:
    """Return the latest trade date from unified_price_data view."""
    result = db.execute(text("SELECT MAX(date) FROM unified_price_data"))
    row = result.fetchone()
    return row[0] if row and row[0] else None


def get_symbols_for_date(db: Session, date_str: str, symbols: Optional[List[str]] = None) -> List[str]:
    """Symbols available on a given date from unified_price_data view."""
    if symbols:
        symbols_upper = [s.upper() for s in symbols]
        placeholders = ','.join([f':sym{i}' for i in range(len(symbols_upper))])
        query = text(f"SELECT DISTINCT symbol FROM unified_price_data WHERE date = :date AND symbol IN ({placeholders})")
        params = {'date': date_str}
        for i, sym in enumerate(symbols_upper):
            params[f'sym{i}'] = sym
        result = db.execute(query, params)
    else:
        result = db.execute(text("SELECT DISTINCT symbol FROM unified_price_data WHERE date = :date"), {"date": date_str})

    rows = result.fetchall()
    return [r[0] for r in rows if r and r[0]]


def load_tail_df(db: Session, symbol: str, cutoff_date: str) -> pd.DataFrame:
    """Load price data from unified_price_data view (combines historical_prices + prices_daily_ohlc)."""
    cols = ["date", "open", "high", "low", "close", "volume"]

    # Query unified_price_data view which already handles the merging logic
    query = text("""
        SELECT date, open, high, low, close, volume
        FROM unified_price_data
        WHERE symbol = :symbol AND date >= :cutoff_date
        ORDER BY date ASC
    """)

    result = db.execute(query, {"symbol": symbol, "cutoff_date": cutoff_date})
    rows = result.fetchall()

    df = pd.DataFrame(rows, columns=cols)
    return df


def get_cutoff(latest_trade_date: str, tail_days: int, buffer_days: int) -> str:
    dt = _to_date(latest_trade_date) - timedelta(days=(tail_days + buffer_days))
    return dt.strftime("%Y-%m-%d")
