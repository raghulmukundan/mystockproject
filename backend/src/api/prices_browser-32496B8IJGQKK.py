from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, and_, or_
from src.db.models import HistoricalPrice, get_db
# Import both current price models
try:
    from app.models.current_price import CurrentPrice as AppCurrentPrice
except ImportError:
    AppCurrentPrice = None

try:
    from app.models.price_daily import PriceDaily
except ImportError:
    PriceDaily = None
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter()

class PriceRecord(BaseModel):
    symbol: str
    date: str
    country: str
    asset_type: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    open_interest: Optional[int] = 0
    source: str
    original_filename: Optional[str] = None
    folder_path: Optional[str] = None

class PricesBrowserResponse(BaseModel):
    prices: List[PriceRecord]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool

def _combine_price_sources(db: Session, filters: dict) -> List[dict]:
    """
    Combine price data from historical_prices, prices_daily, and current_price cache.
    Returns a list of standardized price records.
    """
    all_prices = []

    # Get historical prices
    hist_query = db.query(HistoricalPrice)

    # Apply filters to historical data
    if filters.get('symbol'):
        hist_query = hist_query.filter(HistoricalPrice.symbol == filters['symbol'].upper())
    elif filters.get('symbol_contains'):
        hist_query = hist_query.filter(HistoricalPrice.symbol.contains(filters['symbol_contains'].upper()))

    if filters.get('country'):
        hist_query = hist_query.filter(HistoricalPrice.country == filters['country'].lower())

    if filters.get('asset_type'):
        hist_query = hist_query.filter(HistoricalPrice.asset_type.in_(['stock', 'etf']) if filters['asset_type'].lower() in ['stock', 'etf'] else HistoricalPrice.asset_type == filters['asset_type'].lower())
    else:
        # Default to include stocks and ETFs
        hist_query = hist_query.filter(HistoricalPrice.asset_type.in_(['stock', 'etf']))

    if filters.get('date_from'):
        hist_query = hist_query.filter(HistoricalPrice.date >= filters['date_from'])

    if filters.get('date_to'):
        hist_query = hist_query.filter(HistoricalPrice.date <= filters['date_to'])

    if filters.get('source'):
        hist_query = hist_query.filter(HistoricalPrice.source == filters['source'])

    # Get historical records
    for price in hist_query.all():
        all_prices.append({
            'symbol': price.symbol,
            'date': price.date,
            'country': price.country,
            'asset_type': price.asset_type,
            'open': price.open,
            'high': price.high,
            'low': price.low,
            'close': price.close,
            'volume': price.volume,
            'open_interest': price.open_interest or 0,
            'source': f"historical-{price.source}",
            'original_filename': price.original_filename,
            'folder_path': price.folder_path,
            '_data_source': 'historical'
        })

    # Get current daily prices (prices_daily)
    if PriceDaily is not None:
        daily_query = db.query(PriceDaily)

        if filters.get('symbol'):
            daily_query = daily_query.filter(PriceDaily.symbol == filters['symbol'].upper())
        elif filters.get('symbol_contains'):
            daily_query = daily_query.filter(PriceDaily.symbol.contains(filters['symbol_contains'].upper()))

        if filters.get('date_from'):
            daily_query = daily_query.filter(PriceDaily.date >= filters['date_from'])

        if filters.get('date_to'):
            daily_query = daily_query.filter(PriceDaily.date <= filters['date_to'])

        for price in daily_query.all():
            all_prices.append({
                'symbol': price.symbol,
                'date': price.date,
                'country': 'us',  # Default for daily prices
                'asset_type': 'stock',  # Default for daily prices
                'open': price.open,
                'high': price.high,
                'low': price.low,
                'close': price.close,
                'volume': price.volume,
                'open_interest': 0,
                'source': 'current-daily',
                'original_filename': None,
                'folder_path': None,
                '_data_source': 'daily'
            })

    return all_prices


@router.get("/api/prices/browse", response_model=PricesBrowserResponse)
async def browse_prices(
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Items per page"),
    include_total: bool = Query(False, description="If true, also compute total_count/total_pages (expensive)"),
    symbol: Optional[str] = Query(None, description="Filter by symbol (exact match)"),
    symbol_contains: Optional[str] = Query(None, description="Filter by symbol containing text"),
    country: Optional[str] = Query(None, description="Filter by country (us, uk, de, etc.)"),
    asset_type: Optional[str] = Query(None, description="Filter by asset type (stock, etf, etc.)"),
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

        # Combine all price sources
        filters = {
            'symbol': symbol,
            'symbol_contains': symbol_contains,
            'country': country,
            'asset_type': asset_type,
            'date_from': date_from,
            'date_to': date_to,
            'source': source
        }

        all_prices = _combine_price_sources(db, filters)

        if not all_prices:
            return PricesBrowserResponse(
                prices=[],
                total_count=0,
                page=1,
                page_size=page_size,
                total_pages=0,
                has_next=False,
                has_prev=False
            )

        # Sort the combined data
        reverse = sort_order.lower() == "desc"
        if sort_by == "date":
            all_prices.sort(key=lambda x: x['date'], reverse=reverse)
        elif sort_by == "symbol":
            all_prices.sort(key=lambda x: x['symbol'], reverse=reverse)
        elif sort_by == "close":
            all_prices.sort(key=lambda x: x['close'], reverse=reverse)
        elif sort_by == "volume":
            all_prices.sort(key=lambda x: x['volume'], reverse=reverse)
        else:
            # Default sort by symbol then date
            all_prices.sort(key=lambda x: (x['symbol'], x['date']), reverse=reverse)

        # Apply pagination
        total_count = len(all_prices) if include_total else -1
        offset = (page - 1) * page_size

        if include_total:
            total_pages = (total_count + page_size - 1) // page_size
            has_next = page < total_pages
            prices_data = all_prices[offset:offset + page_size]
        else:
            # Get one extra to check if there's a next page
            prices_data = all_prices[offset:offset + page_size + 1]
            has_next = len(prices_data) > page_size
            prices_data = prices_data[:page_size]
            total_pages = 0

        has_prev = page > 1

        # Convert to response format
        prices = []
        for price_data in prices_data:
            prices.append(PriceRecord(
                symbol=price_data['symbol'],
                date=price_data['date'],
                country=price_data['country'],
                asset_type=price_data['asset_type'],
                open=price_data['open'],
                high=price_data['high'],
                low=price_data['low'],
                close=price_data['close'],
                volume=price_data['volume'],
                open_interest=price_data['open_interest'],
                source=price_data['source'],
                original_filename=price_data['original_filename'],
                folder_path=price_data['folder_path']
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
        
        # Combine statistics from all sources
        from sqlalchemy import func

        # Historical data stats
        historical_count = db.query(HistoricalPrice).count()
        historical_symbols = set()
        min_date = None
        max_date = None
        all_sources = {}

        if historical_count > 0:
            # Include stocks and ETFs
            hist_query = db.query(HistoricalPrice).filter(HistoricalPrice.asset_type.in_(['stock', 'etf']))
            historical_count = hist_query.count()

            historical_symbols.update([s[0] for s in hist_query.with_entities(HistoricalPrice.symbol).distinct().all()])
            min_date = hist_query.with_entities(HistoricalPrice.date).order_by(asc(HistoricalPrice.date)).first()
            max_date = hist_query.with_entities(HistoricalPrice.date).order_by(desc(HistoricalPrice.date)).first()

            hist_sources = hist_query.with_entities(
                HistoricalPrice.source,
                func.count(HistoricalPrice.source).label('count')
            ).group_by(HistoricalPrice.source).all()

            for source, count in hist_sources:
                all_sources[f"historical-{source}"] = count

        # Current daily data stats
        daily_count = 0
        daily_symbols = set()
        if PriceDaily is not None:
            daily_count = db.query(PriceDaily).count()
            if daily_count > 0:
                daily_symbols.update([s[0] for s in db.query(PriceDaily.symbol).distinct().all()])
                all_sources["current-daily"] = daily_count

                # Update date range to include daily data
                daily_min = db.query(PriceDaily.date).order_by(asc(PriceDaily.date)).first()
                daily_max = db.query(PriceDaily.date).order_by(desc(PriceDaily.date)).first()

                if daily_min and (not min_date or daily_min[0] < min_date[0]):
                    min_date = daily_min
                if daily_max and (not max_date or daily_max[0] > max_date[0]):
                    max_date = daily_max

        total_records = historical_count + daily_count
        unique_symbols = len(historical_symbols.union(daily_symbols))
        
        return {
            "total_records": total_records,
            "unique_symbols": unique_symbols,
            "date_range": {
                "from": min_date[0] if min_date else None,
                "to": max_date[0] if max_date else None
            },
            "sources": all_sources
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
