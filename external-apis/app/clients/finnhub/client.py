"""
Finnhub API client
"""
import os
import requests
import time
from typing import Dict, Any, Optional, List
from threading import Lock
from dotenv import load_dotenv

load_dotenv()

class FinnhubClient:
    """
    Simple Finnhub API client with basic functionality and rate limiting
    """

    def __init__(self):
        self.api_key = os.getenv("FINNHUB_API_KEY", "demo")
        self.base_url = "https://finnhub.io/api/v1"
        self.session = requests.Session()

        # Rate limiting: 60 requests per minute for free tier
        self.rate_limit_calls = 60
        self.rate_limit_period = 60  # seconds
        self.call_timestamps = []
        self.rate_limit_lock = Lock()
        
    def _wait_for_rate_limit(self):
        """Wait if necessary to respect rate limits"""
        with self.rate_limit_lock:
            now = time.time()
            # Remove timestamps older than rate_limit_period
            self.call_timestamps = [ts for ts in self.call_timestamps if now - ts < self.rate_limit_period]

            # If we've made too many calls recently, wait
            if len(self.call_timestamps) >= self.rate_limit_calls:
                oldest_call = min(self.call_timestamps)
                wait_time = self.rate_limit_period - (now - oldest_call)
                if wait_time > 0:
                    print(f"Rate limit reached. Waiting {wait_time:.1f} seconds...")
                    time.sleep(wait_time + 0.1)  # Add small buffer

            # Record this call
            self.call_timestamps.append(now)

    def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make request to Finnhub API with rate limiting"""
        # Wait for rate limit if necessary
        self._wait_for_rate_limit()

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