"""
Finnhub API client with rate limiting
"""
import os
import requests
import time
import threading
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv

load_dotenv()

class RateLimiter:
    """Simple rate limiter for Finnhub API (60 requests per minute)"""

    def __init__(self, max_requests: int = 60, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = []
        self.lock = threading.Lock()

    def acquire(self):
        """Wait if necessary to respect rate limit"""
        with self.lock:
            now = time.time()

            # Remove requests older than time window
            self.requests = [req_time for req_time in self.requests if now - req_time < self.time_window]

            # If we're at the limit, wait
            if len(self.requests) >= self.max_requests:
                sleep_time = self.time_window - (now - self.requests[0]) + 0.1  # Small buffer
                if sleep_time > 0:
                    time.sleep(sleep_time)
                    # Clean up again after waiting
                    now = time.time()
                    self.requests = [req_time for req_time in self.requests if now - req_time < self.time_window]

            # Record this request
            self.requests.append(now)

class FinnhubClient:
    """
    Finnhub API client with rate limiting (60 requests per minute)
    """

    def __init__(self):
        self.api_key = os.getenv("FINNHUB_API_KEY", "demo")
        self.base_url = "https://finnhub.io/api/v1"
        self.session = requests.Session()
        self.rate_limiter = RateLimiter(max_requests=60, time_window=60)

    def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make rate-limited request to Finnhub API"""
        # Respect rate limit
        self.rate_limiter.acquire()

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