from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, and_, or_
from src.db.models import HistoricalPrice, get_db
# Temporary: Also import current price cache for fallback
try:
    from app.models.current_price import CurrentPrice as AppCurrentPrice
except ImportError:
    AppCurrentPrice = None
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter()

class PriceRecord(BaseModel):
    symbol: str
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    source: str

class PricesBrowserResponse(BaseModel):
    prices: List[PriceRecord]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool

@router.get("/api/prices/browse", response_model=PricesBrowserResponse)
async def browse_prices(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Items per page"),
    symbol: Optional[str] = Query(None, description="Filter by symbol (exact match)"),
    symbol_contains: Optional[str] = Query(None, description="Filter by symbol containing text"),
    date_from: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
    source: Optional[str] = Query(None, description="Filter by source"),
    sort_by: str = Query("symbol", description="Sort by field"),
    sort_order: str = Query("asc", description="Sort order: asc or desc")
):
    """
    Browse price data with pagination and filtering
    """
    try:
        db = next(get_db())
        
        # Check if historical_prices has data, fallback to current_prices if empty
        historical_count = db.query(HistoricalPrice).count()
        
        if historical_count > 0:
            # Use historical prices table (OHLCV data)
            query = db.query(HistoricalPrice)
            data_source = "historical"
        elif AppCurrentPrice is not None:
            # Fallback to current price cache (single price points)
            query = db.query(AppCurrentPrice)
            data_source = "current_cache"
        else:
            # No data available
            return PricesBrowserResponse(
                prices=[],
                total_count=0,
                page=1,
                page_size=page_size,
                total_pages=0,
                has_next=False,
                has_prev=False
            )
        
        # Apply filters based on data source
        if data_source == "historical":
            # Filters for historical data (OHLCV)
            if symbol:
                query = query.filter(HistoricalPrice.symbol == symbol.upper())
            elif symbol_contains:
                query = query.filter(HistoricalPrice.symbol.contains(symbol_contains.upper()))
            
            if date_from:
                query = query.filter(HistoricalPrice.date >= date_from)
            
            if date_to:
                query = query.filter(HistoricalPrice.date <= date_to)
            
            if source:
                query = query.filter(HistoricalPrice.source == source)
            
            # Apply sorting
            sort_column = getattr(HistoricalPrice, sort_by, HistoricalPrice.symbol)
            if sort_order.lower() == "desc":
                query = query.order_by(desc(sort_column))
            else:
                query = query.order_by(asc(sort_column))
            
            # Add secondary sort by date for consistency
            if sort_by != "date":
                query = query.order_by(desc(HistoricalPrice.date))
                
        else:  # current_cache
            # Filters for current price cache
            if symbol:
                query = query.filter(AppCurrentPrice.symbol == symbol.upper())
            elif symbol_contains:
                query = query.filter(AppCurrentPrice.symbol.contains(symbol_contains.upper()))
            
            # Current cache doesn't have date ranges or source filters
            # Apply sorting (limited columns available)
            if sort_by in ['symbol']:
                sort_column = getattr(AppCurrentPrice, sort_by, AppCurrentPrice.symbol)
                if sort_order.lower() == "desc":
                    query = query.order_by(desc(sort_column))
                else:
                    query = query.order_by(asc(sort_column))
            else:
                query = query.order_by(asc(AppCurrentPrice.symbol))
        
        # Get total count
        total_count = query.count()
        
        # Apply pagination
        offset = (page - 1) * page_size
        prices_data = query.offset(offset).limit(page_size).all()
        
        # Calculate pagination info
        total_pages = (total_count + page_size - 1) // page_size
        has_next = page < total_pages
        has_prev = page > 1
        
        # Convert to response format based on data source
        prices = []
        for price in prices_data:
            if data_source == "historical":
                prices.append(PriceRecord(
                    symbol=price.symbol,
                    date=price.date,
                    open=price.open,
                    high=price.high,
                    low=price.low,
                    close=price.close,
                    volume=price.volume,
                    source=price.source
                ))
            else:  # current_cache
                # Map current price cache to OHLCV format (limited data)
                prices.append(PriceRecord(
                    symbol=price.symbol,
                    date="current",  # No date in current cache
                    open=price.current_price,  # Use current price for all OHLC
                    high=price.current_price,
                    low=price.current_price,
                    close=price.current_price,
                    volume=price.volume or 0,
                    source=f"cache-{price.source}"
                ))
        
        return PricesBrowserResponse(
            prices=prices,
            total_count=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=has_next,
            has_prev=has_prev
        )
        
    except Exception as e:
        logger.error(f"Error browsing prices: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error browsing prices: {str(e)}")

@router.get("/api/prices/stats")
async def get_prices_stats():
    """
    Get statistics about the prices data
    """
    try:
        db = next(get_db())
        
        # Check data source
        historical_count = db.query(HistoricalPrice).count()
        
        if historical_count > 0:
            # Use historical data
            total_records = historical_count
            unique_symbols = db.query(HistoricalPrice.symbol).distinct().count()
            min_date = db.query(HistoricalPrice.date).order_by(asc(HistoricalPrice.date)).first()
            max_date = db.query(HistoricalPrice.date).order_by(desc(HistoricalPrice.date)).first()
            
            from sqlalchemy import func
            sources = db.query(
                HistoricalPrice.source,
                func.count(HistoricalPrice.source).label('count')
            ).group_by(HistoricalPrice.source).all()
            
        elif AppCurrentPrice is not None:
            # Use current cache data
            total_records = db.query(AppCurrentPrice).count()
            unique_symbols = db.query(AppCurrentPrice.symbol).distinct().count()
            min_date = None
            max_date = None
            
            from sqlalchemy import func
            sources = db.query(
                AppCurrentPrice.source,
                func.count(AppCurrentPrice.source).label('count')
            ).group_by(AppCurrentPrice.source).all()
            
        else:
            total_records = 0
            unique_symbols = 0 
            min_date = None
            max_date = None
            sources = []
        
        return {
            "total_records": total_records,
            "unique_symbols": unique_symbols,
            "date_range": {
                "from": min_date[0] if min_date else None,
                "to": max_date[0] if max_date else None
            },
            "sources": {source: count for source, count in sources}
        }
        
    except Exception as e:
        logger.error(f"Error getting prices stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting prices stats: {str(e)}")

@router.delete("/api/prices/cleanup")
async def cleanup_old_prices(
    days_to_keep: int = Query(365, ge=1, description="Number of days to keep")
):
    """
    Clean up old price data (keep only recent N days)
    """
    try:
        db = next(get_db())
        
        from datetime import datetime, timedelta
        cutoff_date = (datetime.now() - timedelta(days=days_to_keep)).strftime('%Y-%m-%d')
        
        # Count records to be deleted
        records_to_delete = db.query(HistoricalPrice).filter(HistoricalPrice.date < cutoff_date).count()
        
        # Delete old records
        deleted_count = db.query(HistoricalPrice).filter(HistoricalPrice.date < cutoff_date).delete()
        db.commit()
        
        return {
            "message": f"Cleanup completed",
            "records_deleted": deleted_count,
            "cutoff_date": cutoff_date,
            "days_kept": days_to_keep
        }
        
    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during cleanup: {str(e)}")