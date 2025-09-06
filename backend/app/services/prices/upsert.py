"""
Price data upsert service
"""
from typing import List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.price_daily import PriceDaily
from app.core.database import SessionLocal
from src.services.prices.providers.schwab_history import Bar

def upsert_daily(symbol: str, bars: List[Bar], source: str = "schwab") -> Dict[str, int]:
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
    
    # Use direct SQLite connection to bypass potential SQLAlchemy issues
    from dotenv import load_dotenv
    import os
    import sqlite3
    
    load_dotenv()
    DATABASE_URL = os.getenv('DATABASE_URL')
    db_path = DATABASE_URL[10:]  # Remove 'sqlite:///'
    
    inserted_count = 0
    updated_count = 0
    skipped_count = 0
    
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        for bar in bars:
            # Check if record exists
            cursor.execute('''
                SELECT COUNT(*) FROM prices_daily 
                WHERE symbol = ? AND date = ?
            ''', (symbol, bar.date))
            
            exists = cursor.fetchone()[0] > 0
            
            if exists:
                # Check if any value differs
                cursor.execute('''
                    SELECT open, high, low, close, volume, source 
                    FROM prices_daily WHERE symbol = ? AND date = ?
                ''', (symbol, bar.date))
                
                existing = cursor.fetchone()
                values_changed = (
                    existing[0] != bar.open or
                    existing[1] != bar.high or
                    existing[2] != bar.low or
                    existing[3] != bar.close or
                    existing[4] != bar.volume or
                    existing[5] != source
                )
                
                if values_changed:
                    # Update existing record
                    cursor.execute('''
                        UPDATE prices_daily 
                        SET open = ?, high = ?, low = ?, close = ?, volume = ?, source = ?
                        WHERE symbol = ? AND date = ?
                    ''', (bar.open, bar.high, bar.low, bar.close, bar.volume, source, symbol, bar.date))
                    updated_count += 1
                else:
                    # No changes needed
                    skipped_count += 1
            else:
                # Insert new record
                cursor.execute('''
                    INSERT INTO prices_daily (symbol, date, open, high, low, close, volume, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (symbol, bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume, source))
                inserted_count += 1
        
        conn.commit()
        
        return {
            "inserted": inserted_count,
            "updated": updated_count,
            "skipped": skipped_count
        }
        
    except Exception as e:
        conn.rollback()
        raise Exception(f"Failed to upsert price data for {symbol}: {str(e)}")
    finally:
        conn.close()

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