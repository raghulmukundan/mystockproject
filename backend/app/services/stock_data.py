import asyncio
import aiohttp
import json
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
import os
from collections import deque
# Removed cache_service - using direct API calls

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
            # Direct API call - no caching
            logger.debug(f"Fetching price for {symbol} from Finnhub API")

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
                                    
                                    # Log the entire metrics response for debugging
                                    logger.info(f"FINNHUB METRICS RESPONSE FOR {symbol}:")
                                    logger.info(f"Full response: {json.dumps(profile_data, indent=2)}")
                                    
                                    # Log all metrics keys to see what's available
                                    logger.info(f"Available metric keys: {sorted(metrics.keys())}")
                                    
                                    market_cap_millions = metrics.get('marketCapitalization')
                                    if market_cap_millions:
                                        market_cap = int(market_cap_millions * 1000000)  # Convert to actual value
                                    
                                    # Extract and log 52-week high/low
                                    # First try the standard field names
                                    high_52w = metrics.get('52WeekHigh')
                                    low_52w = metrics.get('52WeekLow')
                                    logger.info(f"52-week high for {symbol}: {high_52w}")
                                    logger.info(f"52-week low for {symbol}: {low_52w}")
                                    
                                    # Check for alternative field names if standard ones are not found
                                    if high_52w is None:
                                        high_field_candidates = []
                                        for key in metrics.keys():
                                            if ('high' in key.lower() or 'max' in key.lower()) and ('52' in key or 'week' in key.lower()):
                                                high_field_candidates.append((key, metrics[key]))
                                                logger.info(f"Potential 52-week high field: {key} = {metrics[key]}")
                                        
                                        # Use the first non-null candidate if available
                                        for key, value in high_field_candidates:
                                            if value is not None:
                                                high_52w = value
                                                logger.info(f"Using alternative 52-week high field: {key} = {value}")
                                                break
                                    
                                    if low_52w is None:
                                        low_field_candidates = []
                                        for key in metrics.keys():
                                            if ('low' in key.lower() or 'min' in key.lower()) and ('52' in key or 'week' in key.lower()):
                                                low_field_candidates.append((key, metrics[key]))
                                                logger.info(f"Potential 52-week low field: {key} = {metrics[key]}")
                                        
                                        # Use the first non-null candidate if available
                                        for key, value in low_field_candidates:
                                            if value is not None:
                                                low_52w = value
                                                logger.info(f"Using alternative 52-week low field: {key} = {value}")
                                                break
                                    
                                    # Extract price changes for different periods
                                    change_week = metrics.get('52WeekPriceReturnDaily')
                                    change_month = metrics.get('3MonthPriceReturnDaily')
                                    logger.info(f"Weekly change for {symbol}: {change_week}")
                                    logger.info(f"Monthly change for {symbol}: {change_month}")
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
                        
                        # Return the result without caching
                        return stock_price
                    else:
                        logger.warning(f"Finnhub API error for {symbol}: {response.status}")
                        raise ValueError(f"Failed to fetch price data for {symbol} from Finnhub API: {response.status}")
            
        except Exception as e:
            logger.error(f"Error fetching price for {symbol}: {str(e)}")
            # Re-raise the error instead of returning mock data
            raise

    async def get_multiple_stock_prices(self, symbols: List[str]) -> Dict[str, StockPrice]:
        """Get prices for multiple stocks from API"""
        if len(symbols) == 0:
            return {}

        logger.info(f"Fetching prices for {len(symbols)} symbols from API")

        # Fetch all symbols from API directly (no caching)
        price_data = {}

        for symbol in symbols:
            try:
                price = await self.get_stock_price(symbol.upper())
                if price:
                    price_data[symbol.upper()] = price
            except Exception as e:
                logger.error(f"Failed to fetch price for {symbol}: {str(e)}")
                continue

        return price_data

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