from datetime import datetime, timedelta
from typing import List, Optional

import pandas as pd
from sqlalchemy.orm import Session

from src.db.models import SessionLocal, HistoricalPrice

try:
    from app.models.price_daily import PriceDaily  # daily OHLC from Schwab upsert
except Exception:
    PriceDaily = None  # type: ignore


def _to_date(d: str) -> datetime:
    return datetime.strptime(d, "%Y-%m-%d")


def get_latest_trade_date(db: Session) -> Optional[str]:
    """Return the latest trade date from prices_daily if present, else from historical_prices."""
    latest = None
    if PriceDaily is not None:
        row = db.query(PriceDaily.date).order_by(PriceDaily.date.desc()).first()
        if row and row[0]:
            latest = row[0]
    if not latest:
        row2 = db.query(HistoricalPrice.date).order_by(HistoricalPrice.date.desc()).first()
        if row2 and row2[0]:
            latest = row2[0]
    return latest


def get_symbols_for_date(db: Session, date_str: str, symbols: Optional[List[str]] = None) -> List[str]:
    """Symbols updated on a given date, or filter given list against availability."""
    if PriceDaily is not None:
        q = db.query(PriceDaily.symbol).filter(PriceDaily.date == date_str)
        if symbols:
            symbols = [s.upper() for s in symbols]
            q = q.filter(PriceDaily.symbol.in_(symbols))
        rows = q.distinct().all()
        return [r[0] for r in rows if r and r[0]]
    # Fallback to historical_prices if prices_daily is absent
    q = db.query(HistoricalPrice.symbol).filter(HistoricalPrice.date == date_str)
    if symbols:
        symbols = [s.upper() for s in symbols]
        q = q.filter(HistoricalPrice.symbol.in_(symbols))
    rows = q.distinct().all()
    return [r[0] for r in rows if r and r[0]]


def load_tail_df(db: Session, symbol: str, cutoff_date: str) -> pd.DataFrame:
    """Merge recent bars from historical_prices and prices_daily, prefer prices_daily when duplicate dates."""
    cols = ["date", "open", "high", "low", "close", "volume"]
    hp_rows = db.query(HistoricalPrice.date, HistoricalPrice.open, HistoricalPrice.high, HistoricalPrice.low,
                       HistoricalPrice.close, HistoricalPrice.volume).filter(
        HistoricalPrice.symbol == symbol,
        HistoricalPrice.date >= cutoff_date,
        HistoricalPrice.asset_type.in_(['stock', 'etf']),  # include stocks and ETFs
    ).all()
    hp = pd.DataFrame(hp_rows, columns=cols)
  
    if PriceDaily is not None:
        cp_rows = db.query(PriceDaily.date, PriceDaily.open, PriceDaily.high, PriceDaily.low,
                           PriceDaily.close, PriceDaily.volume).filter(
            PriceDaily.symbol == symbol,
            PriceDaily.date >= cutoff_date,
        ).all()
        cp = pd.DataFrame(cp_rows, columns=cols)
    else:
        cp = pd.DataFrame(columns=cols)

    if hp.empty and cp.empty:
        return pd.DataFrame(columns=cols)

    frames = []
    if not hp.empty:
        hp["_src"] = "H"
        frames.append(hp)
    if not cp.empty:
        cp["_src"] = "C"
        frames.append(cp)

    # Concatenate only non-empty frames to avoid pandas future warnings
    if not frames:
        return pd.DataFrame(columns=cols)
    df = pd.concat(frames, ignore_index=True)
    # prefer current over historical on duplicate dates
    df = df.sort_values(["date", "_src"])  # H before C
    df = df.drop_duplicates(subset=["date"], keep="last")  # keep C when duplicate
    df = df.sort_values("date").reset_index(drop=True)
    return df


def get_cutoff(latest_trade_date: str, tail_days: int, buffer_days: int) -> str:
    dt = _to_date(latest_trade_date) - timedelta(days=(tail_days + buffer_days))
    return dt.strftime("%Y-%m-%d")
