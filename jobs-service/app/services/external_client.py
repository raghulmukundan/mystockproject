"""
Clients for communicating with other services
"""
import httpx
import logging
from app.core.config import BACKEND_URL, EXTERNAL_APIS_URL

logger = logging.getLogger(__name__)

class BackendAPIClient:
    """Client for calling backend service endpoints"""
    
    def __init__(self):
        self.base_url = BACKEND_URL
        self.timeout = 30  # Backend calls should be fast
    
    async def get_watchlist_symbols(self):
        """Get all unique symbols from watchlists"""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/watchlists/symbols")
            response.raise_for_status()
            return response.json()
    
    async def refresh_universe(self):
        """Trigger universe refresh"""
        async with httpx.AsyncClient(timeout=300) as client:  # Universe refresh takes longer
            response = await client.post(f"{self.base_url}/api/universe/refresh")
            response.raise_for_status()
            return response.json()
    
    async def run_eod_scan(self):
        """Trigger EOD scan"""
        async with httpx.AsyncClient(timeout=300) as client:  # EOD scan takes longer
            # Send empty body to start scan for today
            response = await client.post(f"{self.base_url}/api/eod/scan/start", json={})
            response.raise_for_status()
            return response.json()
    
    async def run_tech_analysis(self):
        """Trigger technical analysis"""
        async with httpx.AsyncClient(timeout=300) as client:  # Tech analysis takes longer
            # Send empty body as the endpoint expects a RunRequest
            response = await client.post(f"{self.base_url}/api/tech/run", json={})
            response.raise_for_status()
            return response.json()

    async def store_prices(self, prices_data: dict):
        """Store prices in backend's prices_realtime_cache table using provided data"""
        # Use the new direct store endpoint to avoid double API calls
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/prices/store-prices",
                json={"prices_data": prices_data}
            )
            response.raise_for_status()
            result = response.json()
            return result.get('total_stored', 0)

class ExternalAPIClient:
    """Client for calling external APIs service (Schwab, Finnhub)"""
    
    def __init__(self):
        self.base_url = EXTERNAL_APIS_URL
        self.timeout = 60  # External API calls can be slower
    
    async def get_finnhub_prices(self, symbols: list):
        """Get current prices from Finnhub API"""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            # Call Finnhub endpoint with symbols
            symbol_param = ",".join(symbols)
            response = await client.get(f"{self.base_url}/finnhub/quotes?symbols={symbol_param}")
            response.raise_for_status()
            return response.json()

# Singleton instances
backend_client = BackendAPIClient()
external_client = ExternalAPIClient()