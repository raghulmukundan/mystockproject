import os
import time
import threading
import requests
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class SchwabTokenManager:
    """
    Token manager using SCHWAB_REFRESH_TOKEN to obtain/refresh access_token.
    Cache in memory with obtained_at; refresh when older than SCHWAB_STALE_TOKEN_S.
    """
    
    # Class-level shared state so all instances share a single token
    _access_token: Optional[str] = None
    _obtained_at: Optional[float] = None
    _lock = threading.Lock()

    def __init__(self):
        # Configuration from environment
        self.client_id = os.getenv("SCHWAB_CLIENT_ID", "")
        self.client_secret = os.getenv("SCHWAB_CLIENT_SECRET", "")
        self.refresh_token = os.getenv("SCHWAB_REFRESH_TOKEN", "")
        self.base_url = os.getenv("SCHWAB_BASE_URL", "https://api.schwabapi.com")
        self.stale_token_seconds = int(os.getenv("SCHWAB_STALE_TOKEN_S", "2700"))
        self.token_max_retries = int(os.getenv("SCHWAB_TOKEN_MAX_RETRIES", "3"))
        self.token_backoff_base = float(os.getenv("SCHWAB_TOKEN_BACKOFF_BASE_S", "0.5"))

        self.credentials_available = all([self.client_id, self.client_secret, self.refresh_token])
        if not self.credentials_available:
            print("Warning: Schwab credentials not configured. Price history endpoints will not work.")
    
    def is_token_stale(self) -> bool:
        """Check if current token is stale or missing"""
        if not self.__class__._access_token or not self.__class__._obtained_at:
            return True
        
        age = time.time() - self.__class__._obtained_at
        return age > self.stale_token_seconds
    
    def refresh_access_token(self) -> str:
        """
        Refresh access token using refresh token.
        Returns new access token and caches it.
        """
        token_url = f"{self.base_url}/v1/oauth/token"
        
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': self.refresh_token
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        # Use Basic Auth for client credentials (same as OAuth service)
        auth = (self.client_id, self.client_secret)
        
        last_err: Optional[Exception] = None
        for attempt in range(self.token_max_retries + 1):
            try:
                response = requests.post(token_url, data=data, headers=headers, auth=auth, timeout=30)
                response.raise_for_status()
                token_data = response.json()
                self.__class__._access_token = token_data['access_token']
                self.__class__._obtained_at = time.time()
                return self.__class__._access_token
            except requests.RequestException as e:
                last_err = e
                if attempt < self.token_max_retries:
                    time.sleep(self.token_backoff_base * (2 ** attempt))
                else:
                    break
            except KeyError as e:
                last_err = e
                break
        raise Exception(f"Failed to refresh Schwab access token: {str(last_err)}")
    
    def get_access_token(self) -> str:
        """
        Get valid access token, refreshing if necessary.
        """
        if not self.credentials_available:
            raise Exception("Schwab credentials not configured. Please set SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, and SCHWAB_REFRESH_TOKEN in .env")
        
        # Double-checked locking to avoid redundant refreshes
        if self.is_token_stale():
            with self.__class__._lock:
                if self.is_token_stale():
                    return self.refresh_access_token()
        return self.__class__._access_token
