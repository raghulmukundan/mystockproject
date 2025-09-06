import os
import time
import requests
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from .auth import SchwabTokenManager

load_dotenv()

class SchwabHTTPClient:
    """
    HTTP client with retry logic and polite rate limiting for Schwab API.
    """
    
    def __init__(self):
        self.token_manager = SchwabTokenManager()
        
        # Configuration from environment
        self.base_url = os.getenv("SCHWAB_BASE_URL", "https://api.schwabapi.com")
        self.request_sleep_ms = int(os.getenv("SCHWAB_REQ_SLEEP_MS", "250"))
        self.max_retries = int(os.getenv("SCHWAB_MAX_RETRIES", "3"))
        self.backoff_base_ms = int(os.getenv("SCHWAB_BACKOFF_BASE_MS", "400"))
        
        self.session = requests.Session()
        
    def _sleep_between_requests(self):
        """Polite inter-call sleep"""
        if self.request_sleep_ms > 0:
            time.sleep(self.request_sleep_ms / 1000.0)
    
    def _calculate_backoff_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay in seconds"""
        delay_ms = self.backoff_base_ms * (2 ** attempt)
        return delay_ms / 1000.0
    
    def _should_retry(self, status_code: int) -> bool:
        """Check if request should be retried based on status code"""
        return status_code == 429 or status_code >= 500
    
    def request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """
        Make HTTP request with retry logic and authentication.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path (e.g., '/v1/marketdata/AAPL/pricehistory')
            **kwargs: Additional arguments to pass to requests
            
        Returns:
            Response object
            
        Raises:
            Exception: On authentication failure or max retries exceeded
        """
        url = f"{self.base_url}{endpoint}"
        
        # Add Authorization header
        headers = kwargs.get('headers', {})
        headers['Authorization'] = f"Bearer {self.token_manager.get_access_token()}"
        kwargs['headers'] = headers
        
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                # Polite sleep between requests (except first attempt)
                if attempt > 0:
                    self._sleep_between_requests()
                
                response = self.session.request(method, url, timeout=30, **kwargs)
                
                # If successful, return immediately
                if response.status_code < 400:
                    return response
                
                # Log error details for debugging
                print(f"Schwab API Error {response.status_code}: {response.text}")
                
                # Check if we should retry
                if not self._should_retry(response.status_code):
                    response.raise_for_status()
                
                # For retryable errors, continue to next attempt
                last_exception = requests.HTTPError(f"HTTP {response.status_code}: {response.text}")
                
                # If we have more attempts, sleep with exponential backoff
                if attempt < self.max_retries:
                    backoff_delay = self._calculate_backoff_delay(attempt)
                    time.sleep(backoff_delay)
                
            except requests.RequestException as e:
                last_exception = e
                
                # For network errors, retry with backoff
                if attempt < self.max_retries:
                    backoff_delay = self._calculate_backoff_delay(attempt)
                    time.sleep(backoff_delay)
                else:
                    break
        
        # Max retries exceeded
        raise Exception(f"Schwab API request failed after {self.max_retries + 1} attempts: {str(last_exception)}")
    
    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> requests.Response:
        """Make GET request"""
        return self.request('GET', endpoint, params=params)
    
    def post(self, endpoint: str, json_data: Optional[Dict[str, Any]] = None) -> requests.Response:
        """Make POST request"""
        return self.request('POST', endpoint, json=json_data)