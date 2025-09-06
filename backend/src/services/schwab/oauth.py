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
        
        if not all([self.client_id, self.client_secret, self.redirect_uri]):
            raise ValueError("Missing required OAuth credentials in environment variables")
    
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
        
        query_string = urllib.parse.urlencode(params)
        return f"{self.auth_url}?{query_string}"
    
    def exchange_code_for_tokens(self, authorization_code: str) -> Dict[str, Any]:
        """
        Exchange authorization code for access and refresh tokens.
        
        Args:
            authorization_code: Code received from authorization callback
            
        Returns:
            Dictionary containing tokens and metadata
            
        Raises:
            Exception: On token exchange failure
        """
        data = {
            'grant_type': 'authorization_code',
            'code': authorization_code,
            'redirect_uri': self.redirect_uri
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        # Use Basic Auth for client credentials (RFC 6749 standard)
        auth = (self.client_id, self.client_secret)
        
        try:
            response = requests.post(self.token_url, data=data, headers=headers, auth=auth, timeout=30)
            
            # Log the response for debugging
            print(f"Token exchange response: {response.status_code}")
            if response.status_code != 200:
                print(f"Response body: {response.text}")
            
            response.raise_for_status()
            token_data = response.json()
            
            # Validate required fields
            required_fields = ['access_token', 'refresh_token', 'token_type', 'expires_in']
            for field in required_fields:
                if field not in token_data:
                    raise ValueError(f"Missing required field in token response: {field}")
            
            return {
                'access_token': token_data['access_token'],
                'refresh_token': token_data['refresh_token'],
                'token_type': token_data['token_type'],
                'expires_in': token_data['expires_in'],
                'scope': token_data.get('scope', 'readonly'),
                'token_obtained_at': self._current_timestamp()
            }
            
        except requests.RequestException as e:
            raise Exception(f"Failed to exchange authorization code: {str(e)}")
        except (KeyError, ValueError) as e:
            raise Exception(f"Invalid token response: {str(e)}")
    
    def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh access token using refresh token.
        
        Args:
            refresh_token: Valid refresh token
            
        Returns:
            Dictionary containing new tokens and metadata
            
        Raises:
            Exception: On token refresh failure
        """
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        # Use Basic Auth for client credentials
        auth = (self.client_id, self.client_secret)
        
        try:
            response = requests.post(self.token_url, data=data, headers=headers, auth=auth, timeout=30)
            response.raise_for_status()
            
            token_data = response.json()
            
            return {
                'access_token': token_data['access_token'],
                'refresh_token': token_data.get('refresh_token', refresh_token),  # May not return new refresh token
                'token_type': token_data.get('token_type', 'Bearer'),
                'expires_in': token_data['expires_in'],
                'scope': token_data.get('scope', 'readonly'),
                'token_obtained_at': self._current_timestamp()
            }
            
        except requests.RequestException as e:
            raise Exception(f"Failed to refresh access token: {str(e)}")
        except (KeyError, ValueError) as e:
            raise Exception(f"Invalid token refresh response: {str(e)}")
    
    def revoke_token(self, token: str, token_type_hint: str = 'refresh_token') -> bool:
        """
        Revoke access or refresh token.
        
        Args:
            token: Token to revoke
            token_type_hint: Type of token ('access_token' or 'refresh_token')
            
        Returns:
            True if revocation was successful
        """
        revoke_url = f"{self.base_url}/v1/oauth/revoke"
        
        data = {
            'token': token,
            'token_type_hint': token_type_hint,
            'client_id': self.client_id,
            'client_secret': self.client_secret
        }
        
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        try:
            response = requests.post(revoke_url, data=data, headers=headers, timeout=30)
            # OAuth 2.0 spec says revocation endpoint should return 200 even for invalid tokens
            return response.status_code == 200
            
        except requests.RequestException:
            return False
    
    def validate_state(self, received_state: str, expected_state: str) -> bool:
        """
        Validate OAuth state parameter for CSRF protection.
        
        Args:
            received_state: State parameter from callback
            expected_state: Expected state value
            
        Returns:
            True if states match
        """
        return received_state == expected_state
    
    def _current_timestamp(self) -> int:
        """Get current timestamp in seconds"""
        import time
        return int(time.time())
    
    def is_token_expired(self, token_obtained_at: int, expires_in: int, buffer_seconds: int = 300) -> bool:
        """
        Check if token is expired or about to expire.
        
        Args:
            token_obtained_at: Timestamp when token was obtained
            expires_in: Token lifetime in seconds
            buffer_seconds: Buffer time before expiration (default 5 minutes)
            
        Returns:
            True if token is expired or about to expire
        """
        current_time = self._current_timestamp()
        expiry_time = token_obtained_at + expires_in - buffer_seconds
        return current_time >= expiry_time