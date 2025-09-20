"""
HTTP client for communicating with the external APIs service
"""
import httpx
from typing import Dict, Any, Optional, List
from ..core.config import EXTERNAL_APIS_SERVICE_URL
import logging

logger = logging.getLogger(__name__)

class ExternalAPIsClient:
    """
    HTTP client for the external APIs service with fallback support
    """
    
    def __init__(self):
        self.base_url = EXTERNAL_APIS_SERVICE_URL
        self.timeout = 30.0
        
    async def _request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Make HTTP request to external APIs service with error handling"""
        try:
            url = f"{self.base_url}{endpoint}"
            logger.debug(f"Making {method} request to external APIs: {url}")
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(method, url, **kwargs)
                response.raise_for_status()
                logger.debug(f"External APIs request successful: {response.status_code}")
                return response.json()
        except Exception as e:
            logger.error(f"External APIs service request failed ({method} {url}): {e}")
            return None
    
    # Schwab API methods
    async def get_schwab_auth_status(self) -> Optional[Dict[str, Any]]:
        """Get Schwab OAuth status"""
        return await self._request("GET", "/schwab/auth/status")
    
    async def get_schwab_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get Schwab quote for symbol"""
        return await self._request("GET", f"/schwab/quotes/{symbol}")
    
    async def get_schwab_quotes(self, symbols: List[str]) -> Optional[Dict[str, Any]]:
        """Get Schwab quotes for multiple symbols"""
        symbols_str = ",".join(symbols)
        return await self._request("GET", f"/schwab/quotes", params={"symbols": symbols_str})
    
    async def get_schwab_history(self, symbol: str, **params) -> Optional[Dict[str, Any]]:
        """Get Schwab price history"""
        return await self._request("GET", f"/schwab/history/{symbol}", params=params)
    
    async def get_schwab_daily_history(self, symbol: str, start: str, end: str) -> Optional[List[Dict[str, Any]]]:
        """Get Schwab daily OHLCV bars"""
        return await self._request("GET", f"/schwab/history/{symbol}/daily", params={"start": start, "end": end})
    
    async def fetch_schwab_price_history(self, symbols: List[str], start: str, end: str) -> Optional[Dict[str, Any]]:
        """Fetch price history for multiple symbols"""
        return await self._request("POST", "/schwab/history/fetch", 
                                 json=symbols, 
                                 params={"start": start, "end": end})
    
    # Finnhub API methods
    async def get_finnhub_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get Finnhub quote for symbol"""
        return await self._request("GET", f"/finnhub/quote/{symbol}")
    
    async def get_finnhub_company_profile(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get Finnhub company profile"""
        return await self._request("GET", f"/finnhub/company/{symbol}")
    
    async def get_finnhub_metrics(self, symbol: str, metric: str = "all") -> Optional[Dict[str, Any]]:
        """Get Finnhub stock metrics"""
        return await self._request("GET", f"/finnhub/metrics/{symbol}", params={"metric": metric})
    
    async def get_finnhub_news(self, category: str = "general", min_id: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
        """Get Finnhub market news"""
        params = {"category": category}
        if min_id:
            params["min_id"] = min_id
        return await self._request("GET", "/finnhub/news", params=params)

# Global client instance
external_apis_client = ExternalAPIsClient()