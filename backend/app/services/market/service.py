from datetime import datetime, timedelta
from typing import List, Dict, Any
import logging

from .finnhub_client import FinnhubClient
from .cache import PriceCache
from app.utils.date_ranges import parse_range_to_dates, date_to_string
from app.core.config import DATABASE_URL
from app.services.cache_service import cache_service

logger = logging.getLogger(__name__)

class MarketDataService:
    def __init__(self):
        self.finnhub_client = FinnhubClient()
        self.cache = PriceCache(DATABASE_URL)
    
    async def get_daily_candles(
        self, 
        symbol: str, 
        start_date: datetime, 
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get daily candles - cache first, then Finnhub if needed
        Returns normalized candle data sorted by date ascending
        """
        symbol = symbol.upper()
        
        # First, try to get data from cache
        cached_data = self.cache.get_cached_data(symbol, start_date, end_date)
        
        # Check if we have complete coverage
        cache_start, cache_end = self.cache.get_cache_date_range(symbol)
        
        if (cached_data and cache_start and cache_end and 
            cache_start <= start_date.date() and 
            cache_end >= end_date.date()):
            # We have complete coverage in cache
            logger.info(f"Using cached data for {symbol}")
            return cached_data
        
        # We need to fetch from Finnhub
        logger.info(f"Fetching fresh data for {symbol} from Finnhub")
        fresh_data = await self.finnhub_client.get_stock_candles(
            symbol, start_date, end_date
        )
        
        if fresh_data:
            # Cache the fresh data
            upserted_count = self.cache.upsert_candle_data(symbol, fresh_data)
            logger.info(f"Cached {upserted_count} candle records for {symbol}")
            return fresh_data
        
        # If Finnhub fails, return whatever we have in cache
        if cached_data:
            logger.warning(f"Finnhub failed for {symbol}, using partial cached data")
            return cached_data
        
        # No data available
        logger.error(f"No data available for {symbol}")
        return []
    
    async def get_daily_candles_by_range(
        self, 
        symbol: str, 
        range_str: str = "6m"
    ) -> List[Dict[str, Any]]:
        """
        Get daily candles using a range string (e.g., '6m', '1y')
        """
        # Check cache first
        cache_key = f"candles_{symbol.upper()}_{range_str}"
        cached_candles = cache_service.get(cache_key)
        if cached_candles:
            logger.info(f"Using cached candles for {symbol} ({range_str})")
            return cached_candles
        
        # Check if market is open for API calls, allowing first-time fetch if no cache exists
        market_open = cache_service.should_fetch_data(cache_key)
        if not market_open:
            logger.info(f"Market closed and cache exists for {symbol}, skipping API call")
            return []
        
        # If we reach here, either market is open OR market is closed but no cache exists (first-time fetch)
        start_date, end_date = parse_range_to_dates(range_str)
        candles = await self.get_daily_candles(symbol, start_date, end_date)
        
        # Cache the results (extended TTL will be automatically applied if market is closed)
        if candles:
            cache_service.set(cache_key, candles)
            logger.info(f"Cached {len(candles)} candles for {symbol} ({range_str})")
        
        return candles

# Global instance
market_service = MarketDataService()