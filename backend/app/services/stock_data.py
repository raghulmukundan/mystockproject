import asyncio
import aiohttp
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
import os
from collections import deque

logger = logging.getLogger(__name__)

@dataclass
class StockPrice:
    symbol: str
    current_price: float
    change: float
    change_percent: float
    volume: int
    market_cap: Optional[float] = None
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
        self.finnhub_api_key = os.getenv('FINNHUB_API_KEY', 'demo')  # Use 'demo' for testing
        self.schwab_client_id = os.getenv('SCHWAB_CLIENT_ID')
        self.schwab_client_secret = os.getenv('SCHWAB_CLIENT_SECRET')
        
        # API Base URLs
        self.finnhub_base_url = "https://finnhub.io/api/v1"
        
        # Rate limiter
        self.rate_limiter = RateLimiter(max_calls=50, time_window=60)
        
        # Log API key status for debugging
        if self.finnhub_api_key == 'demo':
            logger.warning("FINNHUB_API_KEY not found or set to 'demo' - using mock data")
        else:
            logger.info(f"FINNHUB_API_KEY detected (length: {len(self.finnhub_api_key)} chars) - will use real API data")
            logger.info(f"API key starts with: {self.finnhub_api_key[:10]}...")  # Show first 10 chars for debugging

    async def get_stock_price(self, symbol: str) -> Optional[StockPrice]:
        """Get current stock price using Finnhub API"""
        try:
            # Check cache first
            cache_key = symbol.upper()
            if cache_key in self.price_cache:
                cached_data, timestamp = self.price_cache[cache_key]
                if datetime.now() - timestamp < self.cache_duration:
                    return cached_data

            # Check if we have a valid API key (not demo)
            if self.finnhub_api_key == 'demo':
                logger.info(f"Using demo key, falling back to mock data for {symbol}")
                return self._get_mock_price(symbol)
            
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
                            return self._get_mock_price(symbol)
                        
                        current_price = float(quote_data['c'])  # Current price
                        change = float(quote_data['d'])  # Change
                        change_percent = float(quote_data['dp'])  # Change percent
                        
                        # Get additional market data (volume, market cap)
                        market_cap = None
                        volume = 0
                        
                        # Try to get company profile for market cap
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
                                    market_cap_millions = profile_data.get('metric', {}).get('marketCapitalization')
                                    if market_cap_millions:
                                        market_cap = int(market_cap_millions * 1000000)  # Convert to actual value
                        except Exception as e:
                            logger.debug(f"Could not fetch market cap for {symbol}: {e}")
                        
                        stock_price = StockPrice(
                            symbol=symbol.upper(),
                            current_price=round(current_price, 2),
                            change=round(change, 2),
                            change_percent=round(change_percent, 2),
                            volume=volume,  # Finnhub free tier doesn't include volume in quote
                            market_cap=market_cap,
                            last_updated=datetime.now()
                        )
                        
                        # Cache the result
                        self.price_cache[cache_key] = (stock_price, datetime.now())
                        return stock_price
                    else:
                        logger.warning(f"Finnhub API error for {symbol}: {response.status}")
                        return self._get_mock_price(symbol)
            
        except Exception as e:
            logger.error(f"Error fetching price for {symbol}: {str(e)}")
            # Return mock price data as fallback
            return self._get_mock_price(symbol)

    def _get_mock_price(self, symbol: str) -> Optional[StockPrice]:
        """Get mock price data for common stocks"""
        mock_prices = {
            # Technology
            'AAPL': 175.50, 'GOOGL': 125.30, 'MSFT': 350.75, 'NVDA': 420.30, 'META': 285.90,
            'AMD': 102.85, 'INTC': 35.40, 'CRM': 245.70, 'ORCL': 118.60, 'IBM': 142.30,
            'AVGO': 825.40, 'PLTR': 28.45,
            
            # Electric Vehicles & Auto
            'TSLA': 245.60,
            
            # E-commerce & Retail
            'AMZN': 145.20, 'COST': 685.40, 'HD': 285.90, 'TPR': 45.20,
            
            # Financial Services
            'JPM': 165.25, 'BAC': 34.80, 'WFC': 45.95, 'MA': 385.20, 'V': 245.80,
            'GS': 385.60,
            
            # Healthcare & Pharma
            'UNH': 485.30, 'JNJ': 158.75, 'PFE': 28.95, 'LLY': 685.20, 'ABBV': 165.80,
            
            # Industrial
            'GE': 115.80, 'DE': 420.15, 'CAT': 285.90, 'HWM': 32.10, 'EXP': 155.30,
            
            # Energy
            'XOM': 95.75, 'CVX': 142.60, 'SLB': 42.35, 'COP': 95.40, 'OXY': 58.90
        }
        
        if symbol.upper() in mock_prices:
            mock_price = mock_prices[symbol.upper()]
            change = round((mock_price * (0.04 if hash(symbol) % 2 else -0.02)), 2)  # Variable mock change
            
            return StockPrice(
                symbol=symbol.upper(),
                current_price=mock_price,
                change=change,
                change_percent=round((change / mock_price) * 100, 2),
                volume=1000000 + (hash(symbol) % 500000),  # Variable volume
                market_cap=None,
                last_updated=datetime.now()
            )
        return None

    async def get_multiple_stock_prices(self, symbols: List[str]) -> Dict[str, StockPrice]:
        """Get prices for multiple stocks concurrently with batching"""
        if len(symbols) == 0:
            return {}
        
        logger.info(f"Fetching prices for {len(symbols)} symbols")
        
        # For large batches, process in smaller chunks to avoid timeouts
        batch_size = 10 if len(symbols) > 10 else len(symbols)
        price_data = {}
        
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            logger.info(f"Processing batch {i//batch_size + 1}: {batch}")
            
            # Create tasks for this batch
            tasks = [self.get_stock_price(symbol) for symbol in batch]
            
            # Use asyncio.gather with timeout
            try:
                results = await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=30.0  # 30 second timeout per batch
                )
                
                for symbol, result in zip(batch, results):
                    if isinstance(result, StockPrice):
                        price_data[symbol.upper()] = result
                    elif isinstance(result, Exception):
                        logger.error(f"Error fetching {symbol}: {str(result)}")
                        # Fallback to mock data for failed symbols
                        mock_price = self._get_mock_price(symbol)
                        if mock_price:
                            price_data[symbol.upper()] = mock_price
                
            except asyncio.TimeoutError:
                logger.warning(f"Batch timeout for symbols: {batch}")
                # Fallback to mock data for timed out batch
                for symbol in batch:
                    mock_price = self._get_mock_price(symbol)
                    if mock_price:
                        price_data[symbol.upper()] = mock_price
        
        logger.info(f"Successfully fetched {len(price_data)} prices")
        return price_data

    async def get_company_profile(self, symbol: str) -> Optional[CompanyProfile]:
        """Get company profile data using Finnhub API"""
        try:
            cache_key = symbol.upper()
            if cache_key in self.profile_cache:
                return self.profile_cache[cache_key]

            # Check if we have a valid API key (not demo)
            if self.finnhub_api_key == 'demo':
                logger.info(f"Using demo key, falling back to mock data for {symbol}")
                return self._get_fallback_profile(symbol)
            
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
                            # Fall back to mock data
                            return self._get_fallback_profile(symbol)
                        
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
                        return self._get_fallback_profile(symbol)
            
        except Exception as e:
            logger.error(f"Error fetching company profile for {symbol}: {str(e)}")
            return self._get_fallback_profile(symbol)
    
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
    
    def _get_fallback_profile(self, symbol: str) -> CompanyProfile:
        """Get fallback profile data for common stocks"""
        # Use comprehensive fallback profiles
        mock_profiles = {
            # Technology
            'AAPL': {
                'name': 'Apple Inc.',
                'sector': 'Technology',
                'industry': 'Consumer Electronics',
                'market_cap': 2800000000000,
                'description': 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.'
            },
            'GOOGL': {
                'name': 'Alphabet Inc.',
                'sector': 'Communication Services',
                'industry': 'Internet Content & Information',
                'market_cap': 1600000000000,
                'description': 'Alphabet Inc. provides online advertising services in the United States, Europe, the Middle East, Africa, the Asia-Pacific, Canada, and Latin America.'
            },
            'MSFT': {
                'name': 'Microsoft Corporation',
                'sector': 'Technology',
                'industry': 'Software—Infrastructure',
                'market_cap': 2600000000000,
                'description': 'Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide.'
            },
            'NVDA': {
                'name': 'NVIDIA Corporation',
                'sector': 'Technology',
                'industry': 'Semiconductors',
                'market_cap': 1200000000000,
                'description': 'NVIDIA Corporation operates as a visual computing company worldwide. It designs, develops, and markets graphics processing units (GPUs).'
            },
            'META': {
                'name': 'Meta Platforms, Inc.',
                'sector': 'Communication Services',
                'industry': 'Internet Content & Information',
                'market_cap': 750000000000,
                'description': 'Meta Platforms, Inc. develops products that enable people to connect and share with friends and family through mobile devices, personal computers, virtual reality headsets, and wearables worldwide.'
            },
            'AMD': {
                'name': 'Advanced Micro Devices, Inc.',
                'sector': 'Technology',
                'industry': 'Semiconductors',
                'market_cap': 165000000000,
                'description': 'Advanced Micro Devices, Inc. operates as a semiconductor company worldwide.'
            },
            'INTC': {
                'name': 'Intel Corporation',
                'sector': 'Technology',
                'industry': 'Semiconductors',
                'market_cap': 145000000000,
                'description': 'Intel Corporation designs, manufactures, and sells essential technologies for the cloud, smart, and connected devices.'
            },
            'CRM': {
                'name': 'Salesforce, Inc.',
                'sector': 'Technology',
                'industry': 'Software—Application',
                'market_cap': 245000000000,
                'description': 'Salesforce, Inc. provides customer relationship management technology that brings companies and customers together worldwide.'
            },
            'ORCL': {
                'name': 'Oracle Corporation',
                'sector': 'Technology',
                'industry': 'Software—Infrastructure',
                'market_cap': 385000000000,
                'description': 'Oracle Corporation provides products and services that address enterprise information technology environments worldwide.'
            },
            'IBM': {
                'name': 'International Business Machines Corporation',
                'sector': 'Technology',
                'industry': 'Information Technology Services',
                'market_cap': 125000000000,
                'description': 'International Business Machines Corporation provides integrated solutions and services worldwide.'
            },
            'AVGO': {
                'name': 'Broadcom Inc.',
                'sector': 'Technology',
                'industry': 'Semiconductors',
                'market_cap': 385000000000,
                'description': 'Broadcom Inc. designs, develops, and supplies semiconductor and infrastructure software solutions.'
            },
            'PLTR': {
                'name': 'Palantir Technologies Inc.',
                'sector': 'Technology',
                'industry': 'Software—Infrastructure',
                'market_cap': 65000000000,
                'description': 'Palantir Technologies Inc. builds and deploys software platforms for the intelligence community in the United States.'
            },
            
            # Electric Vehicles & Auto
            'TSLA': {
                'name': 'Tesla, Inc.',
                'sector': 'Consumer Cyclical',
                'industry': 'Auto Manufacturers',
                'market_cap': 750000000000,
                'description': 'Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, and energy generation and storage systems.'
            },
            
            # E-commerce & Retail
            'AMZN': {
                'name': 'Amazon.com, Inc.',
                'sector': 'Consumer Cyclical',
                'industry': 'Internet Retail',
                'market_cap': 1500000000000,
                'description': 'Amazon.com, Inc. engages in the retail sale of consumer products and subscriptions in North America and internationally.'
            },
            'COST': {
                'name': 'Costco Wholesale Corporation',
                'sector': 'Consumer Staples',
                'industry': 'Discount Stores',
                'market_cap': 305000000000,
                'description': 'Costco Wholesale Corporation operates membership warehouses and e-commerce websites.'
            },
            'HD': {
                'name': 'The Home Depot, Inc.',
                'sector': 'Consumer Cyclical',
                'industry': 'Home Improvement Retail',
                'market_cap': 385000000000,
                'description': 'The Home Depot, Inc. operates as a home improvement retailer.'
            },
            'TPR': {
                'name': 'Tapestry, Inc.',
                'sector': 'Consumer Cyclical',
                'industry': 'Luxury Goods',
                'market_cap': 12000000000,
                'description': 'Tapestry, Inc. provides luxury accessories and branded lifestyle products.'
            },
            
            # Financial Services
            'JPM': {
                'name': 'JPMorgan Chase & Co.',
                'sector': 'Financial Services',
                'industry': 'Banks—Diversified',
                'market_cap': 485000000000,
                'description': 'JPMorgan Chase & Co. operates as a financial services company worldwide.'
            },
            'BAC': {
                'name': 'Bank of America Corporation',
                'sector': 'Financial Services',
                'industry': 'Banks—Diversified',
                'market_cap': 285000000000,
                'description': 'Bank of America Corporation provides banking and financial products and services worldwide.'
            },
            'WFC': {
                'name': 'Wells Fargo & Company',
                'sector': 'Financial Services',
                'industry': 'Banks—Diversified',
                'market_cap': 185000000000,
                'description': 'Wells Fargo & Company provides banking, investment and mortgage products and services.'
            },
            'MA': {
                'name': 'Mastercard Incorporated',
                'sector': 'Financial Services',
                'industry': 'Credit Services',
                'market_cap': 375000000000,
                'description': 'Mastercard Incorporated, a technology company, provides transaction processing and other payment-related products and services.'
            },
            'V': {
                'name': 'Visa Inc.',
                'sector': 'Financial Services',
                'industry': 'Credit Services',
                'market_cap': 485000000000,
                'description': 'Visa Inc. operates as a payments technology company worldwide.'
            },
            'GS': {
                'name': 'The Goldman Sachs Group, Inc.',
                'sector': 'Financial Services',
                'industry': 'Capital Markets',
                'market_cap': 145000000000,
                'description': 'The Goldman Sachs Group, Inc. operates as an investment banking, securities, and investment management company worldwide.'
            },
            
            # Healthcare & Pharma
            'UNH': {
                'name': 'UnitedHealth Group Incorporated',
                'sector': 'Healthcare',
                'industry': 'Healthcare Plans',
                'market_cap': 485000000000,
                'description': 'UnitedHealth Group Incorporated operates as a diversified health care company in the United States.'
            },
            'JNJ': {
                'name': 'Johnson & Johnson',
                'sector': 'Healthcare',
                'industry': 'Drug Manufacturers—General',
                'market_cap': 385000000000,
                'description': 'Johnson & Johnson researches, develops, manufactures, and sells various products in the health care field worldwide.'
            },
            'PFE': {
                'name': 'Pfizer Inc.',
                'sector': 'Healthcare',
                'industry': 'Drug Manufacturers—General',
                'market_cap': 165000000000,
                'description': 'Pfizer Inc. develops, manufactures, markets, distributes, and sells biopharmaceutical products worldwide.'
            },
            'LLY': {
                'name': 'Eli Lilly and Company',
                'sector': 'Healthcare',
                'industry': 'Drug Manufacturers—General',
                'market_cap': 685000000000,
                'description': 'Eli Lilly and Company discovers, develops, and markets human pharmaceuticals worldwide.'
            },
            'ABBV': {
                'name': 'AbbVie Inc.',
                'sector': 'Healthcare',
                'industry': 'Drug Manufacturers—General',
                'market_cap': 285000000000,
                'description': 'AbbVie Inc. discovers, develops, manufactures, and sells pharmaceuticals in the worldwide.'
            },
            
            # Industrial
            'GE': {
                'name': 'General Electric Company',
                'sector': 'Industrials',
                'industry': 'Conglomerates',
                'market_cap': 125000000000,
                'description': 'General Electric Company operates as a high-tech industrial company worldwide.'
            },
            'DE': {
                'name': 'Deere & Company',
                'sector': 'Industrials',
                'industry': 'Farm & Heavy Construction Machinery',
                'market_cap': 125000000000,
                'description': 'Deere & Company manufactures and distributes various equipment worldwide.'
            },
            'CAT': {
                'name': 'Caterpillar Inc.',
                'sector': 'Industrials',
                'industry': 'Farm & Heavy Construction Machinery',
                'market_cap': 155000000000,
                'description': 'Caterpillar Inc. manufactures construction and mining equipment, diesel and natural gas engines, industrial gas turbines, and diesel-electric locomotives worldwide.'
            },
            'HWM': {
                'name': 'Howmet Aerospace Inc.',
                'sector': 'Industrials',
                'industry': 'Aerospace & Defense',
                'market_cap': 15000000000,
                'description': 'Howmet Aerospace Inc. provides advanced engineered solutions for the aerospace and transportation industries worldwide.'
            },
            'EXP': {
                'name': 'Eagle Materials Inc.',
                'sector': 'Basic Materials',
                'industry': 'Building Materials',
                'market_cap': 8000000000,
                'description': 'Eagle Materials Inc. produces and supplies heavy construction materials and light building materials in the United States.'
            },
            
            # Energy
            'XOM': {
                'name': 'Exxon Mobil Corporation',
                'sector': 'Energy',
                'industry': 'Oil & Gas Integrated',
                'market_cap': 405000000000,
                'description': 'Exxon Mobil Corporation explores for and produces crude oil and natural gas.'
            },
            'CVX': {
                'name': 'Chevron Corporation',
                'sector': 'Energy',
                'industry': 'Oil & Gas Integrated',
                'market_cap': 275000000000,
                'description': 'Chevron Corporation engages in integrated energy, chemicals, and petroleum operations worldwide.'
            },
            'SLB': {
                'name': 'SLB',
                'sector': 'Energy',
                'industry': 'Oil & Gas Equipment & Services',
                'market_cap': 65000000000,
                'description': 'SLB provides technology for reservoir characterization, drilling, production, and processing to the oil and gas industry worldwide.'
            },
            'COP': {
                'name': 'ConocoPhillips',
                'sector': 'Energy',
                'industry': 'Oil & Gas E&P',
                'market_cap': 125000000000,
                'description': 'ConocoPhillips explores for, produces, transports, and markets crude oil, bitumen, natural gas, liquefied natural gas, and natural gas liquids worldwide.'
            },
            'OXY': {
                'name': 'Occidental Petroleum Corporation',
                'sector': 'Energy',
                'industry': 'Oil & Gas E&P',
                'market_cap': 55000000000,
                'description': 'Occidental Petroleum Corporation engages in the acquisition, exploration, and development of oil and gas properties in the United States, the Middle East, Africa, and Latin America.'
            }
        }
        
        mock_data = mock_profiles.get(symbol.upper())
        if mock_data:
            profile = CompanyProfile(
                symbol=symbol.upper(),
                company_name=mock_data['name'],
                sector=mock_data['sector'],
                industry=mock_data['industry'],
                market_cap=mock_data['market_cap'],
                description=mock_data['description'],
                country='US',
                exchange='NASDAQ'
            )
        else:
            # Basic fallback for unknown symbols
            profile = CompanyProfile(
                symbol=symbol.upper(),
                company_name=f"{symbol.upper()} Corporation",
                sector='Technology',
                industry='Software',
                market_cap=None,
                description=f"Information for {symbol.upper()} is not available.",
                country='US',
                exchange='NASDAQ'
            )
        
        self.profile_cache[symbol.upper()] = profile
        return profile

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
            "api_key_status": "Real API Key" if self.finnhub_api_key != 'demo' else "Demo/Mock Data",
            "rate_limiter": {
                "max_calls_per_minute": self.rate_limiter.max_calls,
                "current_calls_in_window": len(self.rate_limiter.calls),
                "remaining_calls": self.rate_limiter.max_calls - len(self.rate_limiter.calls)
            }
        }

# Global instance
stock_data_service = StockDataService()