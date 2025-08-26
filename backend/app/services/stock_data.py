import asyncio
import aiohttp
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
import os
from collections import deque
from .cache_service import cache_service

logger = logging.getLogger(__name__)

@dataclass
class StockPrice:
    symbol: str
    current_price: float
    change: float
    change_percent: float
    volume: int
    market_cap: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    change_week: Optional[float] = None
    change_month: Optional[float] = None
    last_updated: datetime = None

@dataclass
class CompanyProfile:
    symbol: str
    company_name: str
    sector: str
    industry: str
    market_cap: Optional[float] = None
    description: Optional[str] = None
    country: Optional[str] = None
    exchange: str = "NASDAQ"

class RateLimiter:
    """Rate limiter for API calls - respects Finnhub's 60 requests/minute limit"""
    
    def __init__(self, max_calls: int = 50, time_window: int = 60):
        self.max_calls = max_calls  # Use 50 to be safe under 60/minute limit
        self.time_window = time_window  # 60 seconds
        self.calls = deque()
        self._lock = asyncio.Lock()
    
    async def acquire(self):
        """Wait until we can make another API call"""
        async with self._lock:
            now = datetime.now()
            
            # Remove calls older than time_window
            while self.calls and (now - self.calls[0]).total_seconds() > self.time_window:
                self.calls.popleft()
            
            # If we're at the limit, wait
            if len(self.calls) >= self.max_calls:
                oldest_call = self.calls[0]
                wait_time = self.time_window - (now - oldest_call).total_seconds()
                if wait_time > 0:
                    logger.info(f"Rate limit reached, waiting {wait_time:.1f} seconds")
                    await asyncio.sleep(wait_time)
                    return await self.acquire()  # Recursive call after waiting
            
            # Record this call
            self.calls.append(now)

class StockDataService:
    def __init__(self):
        self.price_cache = {}
        self.profile_cache = {}
        self.cache_duration = timedelta(minutes=5)  # Cache prices for 5 minutes
        
        # API Keys (set via environment variables)
        self.finnhub_api_key = os.getenv('FINNHUB_API_KEY')
        if not self.finnhub_api_key:
            raise ValueError("FINNHUB_API_KEY environment variable must be set with a valid API key")
        
        # API Base URLs
        self.finnhub_base_url = "https://finnhub.io/api/v1"
        
        # Rate limiter
        self.rate_limiter = RateLimiter(max_calls=50, time_window=60)
        
        # Log API key status for debugging
        logger.info(f"FINNHUB_API_KEY detected (length: {len(self.finnhub_api_key)} chars) - will use real API data")
        logger.info(f"API key starts with: {self.finnhub_api_key[:5]}...")  # Show first 5 chars for debugging

    async def get_stock_price(self, symbol: str) -> Optional[StockPrice]:
        """Get current stock price using Finnhub API"""
        try:
            # Check global cache first
            cache_key = f"stock_price_{symbol.upper()}"
            cached_price = cache_service.get(cache_key)
            if cached_price:
                logger.debug(f"Using cached price for {symbol}")
                return cached_price

            # Check market status and cache existence for API call decision
            market_open = cache_service.should_fetch_data(cache_key)
            if not market_open:
                logger.info(f"Market closed, no cache for {symbol} - allowing first-time fetch")
                # Continue to API call for first-time fetch during market close
            else:
                logger.debug(f"Market open, proceeding with API call for {symbol}")
            
            # A valid API key is required
            if not self.finnhub_api_key:
                raise ValueError(f"Cannot fetch price for {symbol} - FINNHUB_API_KEY is not set")
            
            # Apply rate limiting before making API call
            await self.rate_limiter.acquire()
            
            # Fetch from Finnhub API
            async with aiohttp.ClientSession() as session:
                # Get current quote
                quote_url = f"{self.finnhub_base_url}/quote"
                quote_params = {
                    'symbol': symbol.upper(),
                    'token': self.finnhub_api_key
                }
                
                async with session.get(quote_url, params=quote_params) as response:
                    if response.status == 200:
                        quote_data = await response.json()
                        
                        # Check if we got valid data
                        if quote_data.get('c') is None or quote_data.get('c') == 0:
                            logger.warning(f"No quote data found for {symbol}")
                            raise ValueError(f"No quote data found for {symbol} from Finnhub API")
                        
                        current_price = float(quote_data['c'])  # Current price
                        change = float(quote_data['d'])  # Change
                        change_percent = float(quote_data['dp'])  # Change percent
                        
                        # Get additional market data (volume, market cap)
                        market_cap = None
                        volume = 0
                        high_52w = None
                        low_52w = None
                        change_week = None
                        change_month = None
                        
                        # Try to get company profile for market cap and additional metrics
                        profile_url = f"{self.finnhub_base_url}/stock/metric"
                        profile_params = {
                            'symbol': symbol.upper(),
                            'metric': 'all',
                            'token': self.finnhub_api_key
                        }
                        
                        try:
                            # Apply rate limiting for additional API call
                            await self.rate_limiter.acquire()
                            async with session.get(profile_url, params=profile_params) as profile_response:
                                if profile_response.status == 200:
                                    profile_data = await profile_response.json()
                                    metrics = profile_data.get('metric', {})
                                    market_cap_millions = metrics.get('marketCapitalization')
                                    if market_cap_millions:
                                        market_cap = int(market_cap_millions * 1000000)  # Convert to actual value
                                        
                                    # Extract 52-week high/low
                                    high_52w = metrics.get('52WeekHigh')
                                    low_52w = metrics.get('52WeekLow')
                                    
                                    # Extract price changes for different periods
                                    change_week = metrics.get('52WeekPriceReturnDaily')
                                    change_month = metrics.get('3MonthPriceReturnDaily')
                        except Exception as e:
                            logger.debug(f"Could not fetch market cap for {symbol}: {e}")
                        
                        stock_price = StockPrice(
                            symbol=symbol.upper(),
                            current_price=round(current_price, 2),
                            change=round(change, 2),
                            change_percent=round(change_percent, 2),
                            volume=volume,  # Finnhub free tier doesn't include volume in quote
                            market_cap=market_cap,
                            high_52w=high_52w,
                            low_52w=low_52w,
                            change_week=change_week,
                            change_month=change_month,
                            last_updated=datetime.now()
                        )
                        
                        # Cache the result using global cache service with extended TTL if market is closed
                        if not market_open:
                            cache_service.set(cache_key, stock_price, extended_ttl=True)
                            logger.info(f"Cached price for {symbol} until next market open")
                        else:
                            cache_service.set(cache_key, stock_price)
                        return stock_price
                    else:
                        logger.warning(f"Finnhub API error for {symbol}: {response.status}")
                        raise ValueError(f"Failed to fetch price data for {symbol} from Finnhub API: {response.status}")
            
        except Exception as e:
            logger.error(f"Error fetching price for {symbol}: {str(e)}")
            # Re-raise the error instead of returning mock data
            raise

    async def get_multiple_stock_prices(self, symbols: List[str]) -> Dict[str, StockPrice]:
        """Get prices for multiple stocks with cache-first strategy"""
        if len(symbols) == 0:
            return {}
        
        logger.info(f"Fetching prices for {len(symbols)} symbols")
        
        # STEP 1: Check cache for ALL symbols first (super fast)
        price_data = {}
        uncached_symbols = []
        
        for symbol in symbols:
            cache_key = f"stock_price_{symbol.upper()}"
            cached_price = cache_service.get(cache_key)
            if cached_price:
                price_data[symbol.upper()] = cached_price
                logger.debug(f"Cache hit: {symbol}")
            else:
                uncached_symbols.append(symbol)
        
        logger.info(f"Cache results: {len(price_data)} cached, {len(uncached_symbols)} need fetching")
        
        # STEP 2: For uncached symbols, check if we should fetch from API
        if uncached_symbols:
            market_open = cache_service.should_fetch_data()
            
            if not market_open:
                logger.info(f"Market closed - proceeding with first-time fetch for {len(uncached_symbols)} symbols")
                # During market close, use smaller batches and shorter timeout
                batch_size = 3
                timeout = 8.0
            else:
                logger.info(f"Market open - fetching {len(uncached_symbols)} symbols")
                batch_size = 8
                timeout = 15.0
            
            # STEP 3: Process uncached symbols in small batches
            for i in range(0, len(uncached_symbols), batch_size):
                batch = uncached_symbols[i:i + batch_size]
                logger.info(f"API batch {i//batch_size + 1}: {batch}")
                
                # Process batch with individual API calls but with timeout
                batch_results = await self._process_price_batch(batch, timeout)
                price_data.update(batch_results)
                
                # Small delay between batches during market close
                if not market_open and i + batch_size < len(uncached_symbols):
                    await asyncio.sleep(1.0)
        
        logger.info(f"Final result: {len(price_data)} prices returned")
        return price_data
    
    async def _process_price_batch(self, symbols: List[str], timeout: float) -> Dict[str, StockPrice]:
        """Process a small batch of symbols with error handling"""
        batch_results = {}
        
        try:
            # Create tasks for this batch
            tasks = [self.get_stock_price(symbol) for symbol in symbols]
            
            # Execute with timeout
            results = await asyncio.wait_for(
                asyncio.gather(*tasks, return_exceptions=True),
                timeout=timeout
            )
            
            # Process results
            for symbol, result in zip(symbols, results):
                if isinstance(result, StockPrice):
                    batch_results[symbol.upper()] = result
                    logger.debug(f"API success: {symbol}")
                elif isinstance(result, Exception):
                    # Log error but continue with other symbols
                    logger.error(f"Error fetching price for {symbol}: {str(result)}")
                
        except asyncio.TimeoutError:
            # Log timeout error
            logger.error(f"Batch timeout for symbols: {symbols} (timeout: {timeout}s)")
        
        return batch_results

    async def get_company_profile(self, symbol: str) -> Optional[CompanyProfile]:
        """Get company profile data using Finnhub API"""
        try:
            cache_key = symbol.upper()
            if cache_key in self.profile_cache:
                return self.profile_cache[cache_key]

            # A valid API key is required
            if not self.finnhub_api_key:
                raise ValueError(f"Cannot fetch profile for {symbol} - FINNHUB_API_KEY is not set")
            
            # Apply rate limiting before making API call
            await self.rate_limiter.acquire()
            
            # Use Finnhub for company profile data
            async with aiohttp.ClientSession() as session:
                # Get company profile
                profile_url = f"{self.finnhub_base_url}/stock/profile2"
                profile_params = {
                    'symbol': symbol.upper(),
                    'token': self.finnhub_api_key
                }
                
                async with session.get(profile_url, params=profile_params) as response:
                    if response.status == 200:
                        profile_data = await response.json()
                        
                        # Check if we got valid data
                        if not profile_data or not profile_data.get('name'):
                            logger.warning(f"No company profile found for {symbol}")
                            # Raise error instead of falling back to mock data
                            raise ValueError(f"No company profile found for {symbol} from Finnhub API")
                        
                        # Get market cap from metrics endpoint
                        market_cap = None
                        try:
                            metrics_url = f"{self.finnhub_base_url}/stock/metric"
                            metrics_params = {
                                'symbol': symbol.upper(),
                                'metric': 'all',
                                'token': self.finnhub_api_key
                            }
                            
                            # Apply rate limiting for additional API call
                            await self.rate_limiter.acquire()
                            async with session.get(metrics_url, params=metrics_params) as metrics_response:
                                if metrics_response.status == 200:
                                    metrics_data = await metrics_response.json()
                                    market_cap_millions = metrics_data.get('metric', {}).get('marketCapitalization')
                                    if market_cap_millions:
                                        market_cap = int(market_cap_millions * 1000000)
                        except Exception as e:
                            logger.debug(f"Could not fetch market cap for {symbol}: {e}")
                        
                        # Map Finnhub industry to our sector categories
                        industry = profile_data.get('finnhubIndustry', 'Unknown')
                        sector = self._map_industry_to_sector(industry)
                        
                        profile = CompanyProfile(
                            symbol=symbol.upper(),
                            company_name=profile_data.get('name', symbol.upper()),
                            sector=sector,
                            industry=industry,
                            market_cap=market_cap,
                            description=profile_data.get('description'),
                            country=profile_data.get('country', 'US'),
                            exchange=profile_data.get('exchange', 'NASDAQ')
                        )
                        
                        # Cache the result
                        self.profile_cache[cache_key] = profile
                        return profile
                    else:
                        logger.warning(f"Finnhub profile API error for {symbol}: {response.status}")
                        raise ValueError(f"Finnhub profile API error for {symbol}: {response.status}")
            
        except Exception as e:
            logger.error(f"Error fetching company profile for {symbol}: {str(e)}")
            # Re-raise the error instead of returning mock data
            raise
    
    def _map_industry_to_sector(self, industry: str) -> str:
        """Map Finnhub industry to broader sector categories"""
        industry_lower = industry.lower()
        
        if any(term in industry_lower for term in ['software', 'internet', 'tech', 'computer', 'semiconductor']):
            return 'Technology'
        elif any(term in industry_lower for term in ['bank', 'financial', 'insurance', 'investment']):
            return 'Financial Services'
        elif any(term in industry_lower for term in ['oil', 'gas', 'energy', 'petroleum', 'renewable']):
            return 'Energy'
        elif any(term in industry_lower for term in ['health', 'pharmaceutical', 'biotech', 'medical']):
            return 'Healthcare'
        elif any(term in industry_lower for term in ['retail', 'consumer', 'food', 'beverage']):
            return 'Consumer Cyclical'
        elif any(term in industry_lower for term in ['industrial', 'manufacturing', 'construction', 'machinery']):
            return 'Industrials'
        elif any(term in industry_lower for term in ['utilities', 'electric', 'water', 'gas utility']):
            return 'Utilities'
        elif any(term in industry_lower for term in ['real estate', 'reit']):
            return 'Real Estate'
        elif any(term in industry_lower for term in ['material', 'chemical', 'mining', 'metal']):
            return 'Basic Materials'
        elif any(term in industry_lower for term in ['telecom', 'communication', 'media']):
            return 'Communication Services'
        else:
            return 'Unknown'

    async def get_multiple_company_profiles(self, symbols: List[str]) -> Dict[str, CompanyProfile]:
        """Get company profiles for multiple stocks"""
        tasks = [self.get_company_profile(symbol) for symbol in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        profile_data = {}
        for symbol, result in zip(symbols, results):
            if isinstance(result, CompanyProfile):
                profile_data[symbol.upper()] = result
            elif isinstance(result, Exception):
                logger.error(f"Error fetching profile for {symbol}: {str(result)}")
        
        return profile_data

    def clear_cache(self):
        """Clear price and profile caches"""
        self.price_cache.clear()
        self.profile_cache.clear()

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for monitoring"""
        return {
            "price_cache_size": len(self.price_cache),
            "profile_cache_size": len(self.profile_cache),
            "cache_duration_minutes": self.cache_duration.total_seconds() / 60,
            "api_provider": "Finnhub",
            "api_key_status": "Real API Key",
            "rate_limiter": {
                "max_calls_per_minute": self.rate_limiter.max_calls,
                "current_calls_in_window": len(self.rate_limiter.calls),
                "remaining_calls": self.rate_limiter.max_calls - len(self.rate_limiter.calls)
            }
        }

# Global instance
stock_data_service = StockDataService()