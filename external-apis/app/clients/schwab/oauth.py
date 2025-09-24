"""
Schwab OAuth service for handling authorization flow
"""
import os
import secrets
import urllib.parse
import requests
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

class SchwabOAuthService:
    """
    Handles Schwab OAuth 2.0 authorization flow
    """
    
    def __init__(self):
        self.client_id = os.getenv("SCHWAB_CLIENT_ID", "")
        self.client_secret = os.getenv("SCHWAB_CLIENT_SECRET", "")
        self.redirect_uri = os.getenv("SCHWAB_REDIRECT_URI", "")
        self.base_url = os.getenv("SCHWAB_BASE_URL", "https://api.schwabapi.com")
        
        # OAuth URLs (Schwab API v1)
        self.auth_url = f"{self.base_url}/v1/oauth/authorize"
        self.token_url = f"{self.base_url}/v1/oauth/token"
        
        self.credentials_available = all([self.client_id, self.client_secret, self.redirect_uri])
        if not self.credentials_available:
            print("Warning: OAuth credentials not fully configured. OAuth endpoints will not work.")
    
    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Generate authorization URL for user to grant permissions.
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            Authorization URL to redirect user to
        """
        if not state:
            state = secrets.token_urlsafe(32)
        
        params = {
            'response_type': 'code',
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'scope': 'readonly',  # Schwab API readonly scope
            'state': state
        }
        
        return f"{self.auth_url}?{urllib.parse.urlencode(params)}"
    
    def exchange_code_for_tokens(self, authorization_code: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access and refresh tokens.
        
        Args:
            authorization_code: Code received from callback
            
        Returns:
            Token response containing access_token, refresh_token, etc.
        """
        data = {
            'grant_type': 'authorization_code',
            'code': authorization_code,
            'redirect_uri': self.redirect_uri
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        # Use Basic Auth for client credentials
        auth = (self.client_id, self.client_secret)
        
        response = requests.post(self.token_url, data=data, headers=headers, auth=auth, timeout=30)
        response.raise_for_status()
        
        return response.json()