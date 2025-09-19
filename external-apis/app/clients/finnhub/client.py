"""
Finnhub API client
"""
import os
import requests
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv

load_dotenv()

class FinnhubClient:
    """
    Simple Finnhub API client with basic functionality
    """
    
    def __init__(self):
        self.api_key = os.getenv("FINNHUB_API_KEY", "demo")
        self.base_url = "https://finnhub.io/api/v1"
        self.session = requests.Session()
        
    def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make request to Finnhub API"""
        if params is None:
            params = {}
        
        params['token'] = self.api_key
        
        url = f"{self.base_url}{endpoint}"
        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        return response.json()
    
    def get_quote(self, symbol: str) -> Dict[str, Any]:
        """Get stock quote for symbol"""
        return self._request("/quote", {"symbol": symbol})
    
    def get_company_profile(self, symbol: str) -> Dict[str, Any]:
        """Get company profile information"""
        return self._request("/stock/profile2", {"symbol": symbol})
    
    def get_stock_metrics(self, symbol: str, metric: str = "all") -> Dict[str, Any]:
        """Get stock metrics"""
        return self._request("/stock/metric", {"symbol": symbol, "metric": metric})
    
    def get_news(self, category: str = "general", min_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get market news"""
        params = {"category": category}
        if min_id:
            params["minId"] = min_id
        return self._request("/news", params)
    
    def get_company_news(self, symbol: str, from_date: str, to_date: str) -> List[Dict[str, Any]]:
        """Get company-specific news"""
        return self._request("/company-news", {
            "symbol": symbol,
            "from": from_date,
            "to": to_date
        })