"""
Price data upsert service
"""
from typing import List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.price_daily import PriceDaily
from app.core.database import SessionLocal
from src.services.prices.providers.schwab_history import Bar

def upsert_daily(symbol: str, bars: List[Bar], source: str = "schwab", update_if_changed: bool = False) -> Dict[str, int]:
    """
    Upsert bars into prices_daily (PK symbol+date).
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
            existing_record = db.query(PriceDaily).filter(
                and_(
                    PriceDaily.symbol == symbol,
                    PriceDaily.date == bar.date
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
                new_record = PriceDaily(
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

def get_price_data_stats(symbol: str, start: str, end: str) -> Dict[str, any]:
    """
    Get statistics about existing price data for a symbol and date range.
    
    Args:
        symbol: Stock symbol
        start: Start date YYYY-MM-DD
        end: End date YYYY-MM-DD
        
    Returns:
        Dictionary with stats: {"symbol": str, "rows": int, "first": str, "last": str}
    """
    db = SessionLocal()
    try:
        # Query for records in date range
        query = db.query(PriceDaily).filter(
            and_(
                PriceDaily.symbol == symbol,
                PriceDaily.date >= start,
                PriceDaily.date <= end
            )
        )
        
        records = query.all()
        
        if not records:
            return {
                "symbol": symbol,
                "rows": 0,
                "first": None,
                "last": None
            }
        
        # Get date range
        dates = [record.date for record in records]
        dates.sort()
        
        return {
            "symbol": symbol,
            "rows": len(records),
            "first": dates[0],
            "last": dates[-1]
        }
        
    finally:
        db.close()
