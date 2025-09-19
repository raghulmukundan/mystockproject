"""
Schwab API endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from ..clients.schwab.client import SchwabHTTPClient
from ..clients.schwab.oauth import SchwabOAuthService
from ..clients.schwab.symbols import to_schwab_symbol, from_schwab_symbol
import urllib.parse
import os

router = APIRouter()

# Response models
class OAuthStatus(BaseModel):
    authenticated: bool
    client_id: str
    scope: Optional[str] = "readonly"

# Initialize clients
schwab_client = SchwabHTTPClient()
try:
    oauth_service = SchwabOAuthService()
except Exception as e:
    print(f"Warning: OAuth service initialization failed: {e}")
    oauth_service = None

@router.get("/health")
async def schwab_health():
    """Health check for Schwab service"""
    try:
        # Check if we have credentials configured
        token_manager = schwab_client.token_manager
        return {
            "status": "healthy",
            "credentials_configured": token_manager.credentials_available
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@router.get("/oauth/url")
async def get_oauth_url(state: Optional[str] = None):
    """Get OAuth authorization URL"""
    if oauth_service is None:
        raise HTTPException(status_code=503, detail="OAuth service not configured")
    try:
        url = oauth_service.get_authorization_url(state)
        return {"authorization_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auth/status", response_model=OAuthStatus)
async def oauth_status():
    """
    Check OAuth configuration and authentication status.
    """
    if oauth_service is None:
        return OAuthStatus(
            authenticated=False,
            client_id="Not configured"
        )
    
    # Check if we have a refresh token configured
    refresh_token = os.getenv("SCHWAB_REFRESH_TOKEN", "")
    
    return OAuthStatus(
        authenticated=bool(refresh_token),
        client_id=oauth_service.client_id[:8] + "..." if oauth_service.client_id else "Not configured",
        scope="readonly"
    )

@router.post("/oauth/token")
async def exchange_oauth_code(authorization_code: str):
    """Exchange authorization code for tokens"""
    if oauth_service is None:
        raise HTTPException(status_code=503, detail="OAuth service not configured")
    try:
        tokens = oauth_service.exchange_code_for_tokens(authorization_code)
        return tokens
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auth/status", response_model=OAuthStatus)
async def oauth_status():
    """
    Check OAuth configuration and authentication status.
    """
    if oauth_service is None:
        return OAuthStatus(
            authenticated=False,
            client_id="Not configured"
        )
    
    # Check if we have a refresh token configured
    refresh_token = os.getenv("SCHWAB_REFRESH_TOKEN", "")
    
    return OAuthStatus(
        authenticated=bool(refresh_token),
        client_id=oauth_service.client_id[:8] + "..." if oauth_service.client_id else "Not configured",
        scope="readonly"
    )

@router.get("/quotes/{symbol}")
async def get_quote(symbol: str):
    """Get stock quote for symbol"""
    try:
        schwab_symbol = to_schwab_symbol(symbol)
        endpoint = f"/v1/marketdata/{urllib.parse.quote(schwab_symbol)}/quotes"
        response = schwab_client.get(endpoint)
        data = response.json()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auth/status", response_model=OAuthStatus)
async def oauth_status():
    """
    Check OAuth configuration and authentication status.
    """
    if oauth_service is None:
        return OAuthStatus(
            authenticated=False,
            client_id="Not configured"
        )
    
    # Check if we have a refresh token configured
    refresh_token = os.getenv("SCHWAB_REFRESH_TOKEN", "")
    
    return OAuthStatus(
        authenticated=bool(refresh_token),
        client_id=oauth_service.client_id[:8] + "..." if oauth_service.client_id else "Not configured",
        scope="readonly"
    )

@router.get("/quotes")
async def get_multiple_quotes(symbols: str = Query(..., description="Comma-separated list of symbols")):
    """Get quotes for multiple symbols"""
    try:
        symbol_list = [s.strip() for s in symbols.split(",")]
        schwab_symbols = [to_schwab_symbol(s) for s in symbol_list]
        encoded_symbols = urllib.parse.quote(",".join(schwab_symbols))
        
        endpoint = f"/v1/marketdata/quotes?symbols={encoded_symbols}"
        response = schwab_client.get(endpoint)
        data = response.json()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{symbol}")
async def get_price_history(
    symbol: str,
    period_type: str = Query("year", description="day, month, year, ytd"),
    period: int = Query(1, description="Number of periods"),
    frequency_type: str = Query("daily", description="minute, daily, weekly, monthly"),
    frequency: int = Query(1, description="Frequency within frequency_type")
):
    """Get price history for symbol"""
    try:
        schwab_symbol = to_schwab_symbol(symbol)
        endpoint = f"/v1/marketdata/{urllib.parse.quote(schwab_symbol)}/pricehistory"
        
        params = {
            "periodType": period_type,
            "period": period,
            "frequencyType": frequency_type,
            "frequency": frequency
        }
        
        response = schwab_client.get(endpoint, params=params)
        data = response.json()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auth/status", response_model=OAuthStatus)
async def oauth_status():
    """
    Check OAuth configuration and authentication status.
    """
    if oauth_service is None:
        return OAuthStatus(
            authenticated=False,
            client_id="Not configured"
        )
    
    # Check if we have a refresh token configured
    refresh_token = os.getenv("SCHWAB_REFRESH_TOKEN", "")
    
    return OAuthStatus(
        authenticated=bool(refresh_token),
        client_id=oauth_service.client_id[:8] + "..." if oauth_service.client_id else "Not configured",
        scope="readonly"
    )

@router.get("/instruments/search")
async def search_instruments(
    symbol: str = Query(..., description="Symbol to search for"),
    projection: str = Query("symbol-search", description="symbol-search, symbol-regex, desc-search, desc-regex, fundamental")
):
    """Search for instruments"""
    try:
        endpoint = "/v1/instruments"
        params = {
            "symbol": symbol,
            "projection": projection
        }
        
        response = schwab_client.get(endpoint, params=params)
        data = response.json()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auth/status", response_model=OAuthStatus)
async def oauth_status():
    """
    Check OAuth configuration and authentication status.
    """
    if oauth_service is None:
        return OAuthStatus(
            authenticated=False,
            client_id="Not configured"
        )
    
    # Check if we have a refresh token configured
    refresh_token = os.getenv("SCHWAB_REFRESH_TOKEN", "")
    
    return OAuthStatus(
        authenticated=bool(refresh_token),
        client_id=oauth_service.client_id[:8] + "..." if oauth_service.client_id else "Not configured",
        scope="readonly"
    )