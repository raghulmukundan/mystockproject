from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, and_, or_, union_all, text
from src.db.models import HistoricalPrice, get_db
from app.models.daily_ohlc_price import DailyOHLCPrice
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
    Browse price data combining historical_prices + prices_daily_ohlc tables
    """
    try:
        db = next(get_db())

        # Check if we have data in either table
        hist_count = db.query(HistoricalPrice).count()
        daily_count = db.query(DailyOHLCPrice).count()

        # If no data in either table, return empty result
        if hist_count == 0 and daily_count == 0:
            return PricesBrowserResponse(
                prices=[],
                total_count=0,
                page=page,
                page_size=page_size,
                total_pages=0,
                has_next=False,
                has_prev=False
            )

        # Collect data from both tables separately, then combine
        all_prices = []

        # Get data from historical_prices if it exists
        if hist_count > 0:
            hist_query = db.query(HistoricalPrice)

            # Apply filters for historical data
            if symbol:
                hist_query = hist_query.filter(HistoricalPrice.symbol == symbol.upper())
            elif symbol_contains:
                hist_query = hist_query.filter(HistoricalPrice.symbol.contains(symbol_contains.upper()))

            if country:
                hist_query = hist_query.filter(HistoricalPrice.country == country.lower())

            if asset_type:
                hist_query = hist_query.filter(HistoricalPrice.asset_type == asset_type.lower())

            if date_from:
                hist_query = hist_query.filter(HistoricalPrice.date >= date_from)

            if date_to:
                hist_query = hist_query.filter(HistoricalPrice.date <= date_to)

            if source:
                hist_query = hist_query.filter(HistoricalPrice.source == source)

            # Get historical results
            hist_results = hist_query.all()
            for price in hist_results:
                all_prices.append({
                    'symbol': price.symbol,
                    'date': price.date,
                    'country': price.country,
                    'asset_type': price.asset_type,
                    'open': float(price.open),
                    'high': float(price.high),
                    'low': float(price.low),
                    'close': float(price.close),
                    'volume': int(price.volume or 0),
                    'open_interest': int(price.open_interest or 0),
                    'source': price.source,
                    'original_filename': price.original_filename,
                    'folder_path': price.folder_path
                })

        # Get data from prices_daily_ohlc if it exists
        if daily_count > 0:
            daily_query = db.query(DailyOHLCPrice)

            # Apply filters for daily data
            if symbol:
                daily_query = daily_query.filter(DailyOHLCPrice.symbol == symbol.upper())
            elif symbol_contains:
                daily_query = daily_query.filter(DailyOHLCPrice.symbol.contains(symbol_contains.upper()))

            # For daily data filters, only include if they match our defaults
            if country and country.lower() != 'us':
                pass  # Skip daily data if non-us country requested
            elif asset_type and asset_type.lower() != 'stock':
                pass  # Skip daily data if non-stock asset type requested
            else:
                if date_from:
                    daily_query = daily_query.filter(DailyOHLCPrice.date >= date_from)

                if date_to:
                    daily_query = daily_query.filter(DailyOHLCPrice.date <= date_to)

                if source:
                    daily_query = daily_query.filter(DailyOHLCPrice.source == source)

                # Get daily results
                daily_results = daily_query.all()
                for price in daily_results:
                    all_prices.append({
                        'symbol': price.symbol,
                        'date': price.date,
                        'country': 'us',  # Default for daily data
                        'asset_type': 'stock',  # Default for daily data
                        'open': float(price.open),
                        'high': float(price.high),
                        'low': float(price.low),
                        'close': float(price.close),
                        'volume': int(price.volume or 0),
                        'open_interest': 0,  # Default for daily data
                        'source': price.source,
                        'original_filename': None,
                        'folder_path': None
                    })

        # Sort the combined results
        if sort_by in ['symbol', 'date', 'close', 'volume']:
            reverse_sort = sort_order.lower() == "desc"
            all_prices.sort(key=lambda x: x.get(sort_by, ''), reverse=reverse_sort)
            # Secondary sort by date if not primary sort
            if sort_by != "date":
                all_prices.sort(key=lambda x: x.get('date', ''), reverse=True)

        # Apply pagination
        total_count = len(all_prices)
        offset = (page - 1) * page_size
        prices_data = all_prices[offset:offset + page_size]

        # Calculate pagination info
        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0
        has_next = page < total_pages
        has_prev = page > 1

        # Convert to response format
        prices = []
        for price_dict in prices_data:
            prices.append(PriceRecord(
                symbol=price_dict['symbol'],
                date=price_dict['date'],
                country=price_dict['country'],
                asset_type=price_dict['asset_type'],
                open=price_dict['open'],
                high=price_dict['high'],
                low=price_dict['low'],
                close=price_dict['close'],
                volume=price_dict['volume'],
                open_interest=price_dict['open_interest'],
                source=price_dict['source'],
                original_filename=price_dict['original_filename'],
                folder_path=price_dict['folder_path']
            ))

        return PricesBrowserResponse(
            prices=prices,
            total_count=total_count if include_total else -1,
            page=page,
            page_size=page_size,
            total_pages=total_pages if include_total else 0,
            has_next=has_next,
            has_prev=has_prev
        )

    except Exception as e:
        logger.error(f"Error browsing prices: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error browsing prices: {str(e)}")

@router.get("/api/prices/stats")
async def get_prices_stats():
    """
    Get statistics about the combined prices data from historical_prices + prices_daily_ohlc
    """
    try:
        db = next(get_db())

        from sqlalchemy import func

        # Get stats from both tables
        historical_count = db.query(HistoricalPrice).count()
        daily_count = db.query(DailyOHLCPrice).count()
        total_records = historical_count + daily_count

        # Get unique symbols from both tables using a simpler approach
        hist_symbols = set()
        daily_symbols = set()

        if historical_count > 0:
            hist_result = db.query(HistoricalPrice.symbol).distinct().all()
            hist_symbols = {row[0] for row in hist_result}

        if daily_count > 0:
            daily_result = db.query(DailyOHLCPrice.symbol).distinct().all()
            daily_symbols = {row[0] for row in daily_result}

        # Combine unique symbols
        all_symbols = hist_symbols.union(daily_symbols)
        unique_symbols = len(all_symbols)

        # Get date ranges from both tables
        hist_dates = []
        daily_dates = []

        if historical_count > 0:
            hist_min = db.query(HistoricalPrice.date).order_by(asc(HistoricalPrice.date)).first()
            hist_max = db.query(HistoricalPrice.date).order_by(desc(HistoricalPrice.date)).first()
            if hist_min and hist_max:
                hist_dates = [hist_min[0], hist_max[0]]

        if daily_count > 0:
            daily_min = db.query(DailyOHLCPrice.date).order_by(asc(DailyOHLCPrice.date)).first()
            daily_max = db.query(DailyOHLCPrice.date).order_by(desc(DailyOHLCPrice.date)).first()
            if daily_min and daily_max:
                daily_dates = [daily_min[0], daily_max[0]]

        # Combine date ranges
        all_dates = hist_dates + daily_dates
        min_date = min(all_dates) if all_dates else None
        max_date = max(all_dates) if all_dates else None

        # Get source statistics from both tables
        sources = {}

        if historical_count > 0:
            hist_sources = db.query(
                HistoricalPrice.source,
                func.count(HistoricalPrice.source).label('count')
            ).group_by(HistoricalPrice.source).all()
            for source, count in hist_sources:
                sources[source] = sources.get(source, 0) + count

        if daily_count > 0:
            daily_sources = db.query(
                DailyOHLCPrice.source,
                func.count(DailyOHLCPrice.source).label('count')
            ).group_by(DailyOHLCPrice.source).all()
            for source, count in daily_sources:
                sources[source] = sources.get(source, 0) + count

        return {
            "total_records": total_records,
            "historical_records": historical_count,
            "daily_ohlc_records": daily_count,
            "unique_symbols": unique_symbols,
            "date_range": {
                "from": min_date,
                "to": max_date
            },
            "sources": sources
        }

    except Exception as e:
        logger.error(f"Error getting prices stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting prices stats: {str(e)}")

@router.delete("/api/prices/cleanup")
async def cleanup_old_prices(
    days_to_keep: int = Query(365, ge=1, description="Number of days to keep")
):
    """
    Clean up old price data from both historical_prices and prices_daily_ohlc tables
    """
    try:
        db = next(get_db())

        from datetime import datetime, timedelta
        cutoff_date = (datetime.now() - timedelta(days=days_to_keep)).strftime('%Y-%m-%d')

        # Count records to be deleted from both tables
        hist_to_delete = db.query(HistoricalPrice).filter(HistoricalPrice.date < cutoff_date).count()
        daily_to_delete = db.query(DailyOHLCPrice).filter(DailyOHLCPrice.date < cutoff_date).count()

        # Delete old records from both tables
        hist_deleted = db.query(HistoricalPrice).filter(HistoricalPrice.date < cutoff_date).delete()
        daily_deleted = db.query(DailyOHLCPrice).filter(DailyOHLCPrice.date < cutoff_date).delete()

        db.commit()

        total_deleted = hist_deleted + daily_deleted

        return {
            "message": f"Cleanup completed on both historical_prices and prices_daily_ohlc tables",
            "records_deleted": {
                "total": total_deleted,
                "historical_prices": hist_deleted,
                "prices_daily_ohlc": daily_deleted
            },
            "cutoff_date": cutoff_date,
            "days_kept": days_to_keep
        }

    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during cleanup: {str(e)}")
