"""
Price data upsert service for jobs-service
"""
from typing import List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.db.models import DailyOHLCPrice
from app.core.database import SessionLocal

class Bar:
    """Simple data class for price bar data"""
    def __init__(self, date: str, open: float, high: float, low: float, close: float, volume: int = 0):
        self.date = date
        self.open = open
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume

def upsert_daily(symbol: str, bars: List[Bar], source: str = "schwab", update_if_changed: bool = False) -> Dict[str, int]:
    """
    Upsert bars into prices_daily_ohlc (PK symbol+date).
    Returns counts: {"inserted": n1, "updated": n2, "skipped": n3}

    Args:
        symbol: Stock symbol
        bars: List of Bar objects to upsert
        source: Data source identifier

    Returns:
        Dictionary with operation counts
    """
    if not bars:
        return {"inserted": 0, "updated": 0, "skipped": 0}

    inserted_count = 0
    updated_count = 0
    skipped_count = 0

    db = SessionLocal()
    try:
        for bar in bars:
            # Check if record exists
            existing_record = db.query(DailyOHLCPrice).filter(
                and_(
                    DailyOHLCPrice.symbol == symbol,
                    DailyOHLCPrice.date == bar.date
                )
            ).first()

            if existing_record:
                if update_if_changed:
                    # Check if any value differs
                    values_changed = (
                        existing_record.open != bar.open or
                        existing_record.high != bar.high or
                        existing_record.low != bar.low or
                        existing_record.close != bar.close or
                        existing_record.volume != bar.volume or
                        existing_record.source != source
                    )
                    if values_changed:
                        existing_record.open = bar.open
                        existing_record.high = bar.high
                        existing_record.low = bar.low
                        existing_record.close = bar.close
                        existing_record.volume = bar.volume
                        existing_record.source = source
                        updated_count += 1
                    else:
                        skipped_count += 1
                else:
                    # Insert-only mode: do not update existing rows
                    skipped_count += 1
            else:
                # Insert new record
                new_record = DailyOHLCPrice(
                    symbol=symbol,
                    date=bar.date,
                    open=bar.open,
                    high=bar.high,
                    low=bar.low,
                    close=bar.close,
                    volume=bar.volume,
                    source=source
                )
                db.add(new_record)
                inserted_count += 1

        db.commit()

        return {
            "inserted": inserted_count,
            "updated": updated_count,
            "skipped": skipped_count
        }

    except Exception as e:
        db.rollback()
        raise Exception(f"Failed to upsert price data for {symbol}: {str(e)}")
    finally:
        db.close()