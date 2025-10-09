"""
Schwab API endpoints
"""
import time
import os
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from ..clients.schwab.client import SchwabHTTPClient
from ..clients.schwab.oauth import SchwabOAuthService
from ..clients.schwab.symbols import to_schwab_symbol, from_schwab_symbol
from ..services.prices.providers.schwab_history import SchwabHistoryProvider, ProviderError
import urllib.parse

router = APIRouter()

# Response models
class OAuthStatus(BaseModel):
    authenticated: bool
    client_id: str
    scope: Optional[str] = "readonly"

class TokenStatus(BaseModel):
    valid: bool
    stale: bool
    obtained_at: Optional[float] = None
    age_seconds: Optional[float] = None
    expires_in: Optional[int] = None
    credentials_available: bool
    message: Optional[str] = None

class SymbolResult(BaseModel):
    symbol: str
    bars_count: int
    error: Optional[str] = None

class FetchHistoryResponse(BaseModel):
    start: str
    end: str
    results: List[SymbolResult]
    duration_s: float

class BarResponse(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int

# Initialize clients
schwab_client = SchwabHTTPClient()
try:
    oauth_service = SchwabOAuthService()
except Exception as e:
    print(f"Warning: OAuth service initialization failed: {e}")
    oauth_service = None

# Lazy provider initialization
history_provider = None

def get_history_provider():
    global history_provider
    if history_provider is None:
        history_provider = SchwabHistoryProvider()
    return history_provider

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
    Tests if refresh token is valid by attempting to get an access token.
    """
    if oauth_service is None:
        return OAuthStatus(
            authenticated=False,
            client_id="Not configured"
        )

    # Check if we have a refresh token configured
    refresh_token = os.getenv("SCHWAB_REFRESH_TOKEN", "")

    if not refresh_token:
        return OAuthStatus(
            authenticated=False,
            client_id=oauth_service.client_id[:8] + "..." if oauth_service.client_id else "Not configured",
            scope="readonly"
        )

    # Try to validate the refresh token by getting an access token
    try:
        from app.clients.schwab.auth import SchwabTokenManager
        token_manager = SchwabTokenManager()
        # This will attempt to refresh and throw exception if invalid
        token_manager.get_access_token()

        return OAuthStatus(
            authenticated=True,
            client_id=oauth_service.client_id[:8] + "..." if oauth_service.client_id else "Not configured",
            scope="readonly"
        )
    except Exception as e:
        # Refresh token exists but is invalid/expired
        return OAuthStatus(
            authenticated=False,
            client_id=oauth_service.client_id[:8] + "..." if oauth_service.client_id else "Not configured",
            scope=f"Token validation failed: {str(e)[:100]}"
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

@router.get("/oauth/callback")
@router.post("/oauth/callback")
async def oauth_callback(code: str = Query(...), state: Optional[str] = None):
    """Handle OAuth callback from Schwab"""
    if oauth_service is None:
        raise HTTPException(status_code=503, detail="OAuth service not configured")

    try:
        print(f"🔍 DEBUG: Received authorization code: {code[:10]}...")
        tokens = oauth_service.exchange_code_for_tokens(code)
        print(f"🔍 DEBUG: Full tokens response: {tokens}")
        refresh_token = tokens.get('refresh_token', 'No refresh token returned')
        print(f"🔍 DEBUG: Extracted refresh token: {refresh_token[:20]}...{refresh_token[-10:] if len(refresh_token) > 30 else refresh_token}")
        access_token = tokens.get('access_token', 'No access token returned')
        print(f"🔍 DEBUG: Extracted access token: {access_token[:20]}...{access_token[-10:] if len(access_token) > 30 else access_token}")

        # Return HTML page with the token
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Schwab OAuth Success</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; }}
                .success {{ color: green; }}
                .token {{ background: #f5f5f5; padding: 20px; border-radius: 5px; word-break: break-all; }}
                .instructions {{ background: #e7f3ff; padding: 15px; border-radius: 5px; margin-top: 20px; }}
            </style>
        </head>
        <body>
            <h1 class="success">✅ Schwab OAuth Success!</h1>
            <p>Your new refresh token is:</p>
            <div class="token">{refresh_token}</div>

            <div style="background: #f0f0f0; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 12px;">
                <strong>Debug Info:</strong><br>
                Authorization Code: {code}<br>
                Access Token: {access_token}<br>
                Full Response Keys: {list(tokens.keys()) if tokens else 'None'}
            </div>

            <div class="instructions">
                <h3>Next Steps:</h3>
                <ol>
                    <li>Copy the refresh token above</li>
                    <li>Update your .env file: <code>SCHWAB_REFRESH_TOKEN=your_new_token</code></li>
                    <li>Restart the external-apis service: <code>docker-compose restart external-apis</code></li>
                </ol>
                <p><strong>⚠️ Remember:</strong> Schwab refresh tokens expire after 7 days.</p>
            </div>
        </body>
        </html>
        """

        return HTMLResponse(content=html_content, status_code=200)

    except Exception as e:
        error_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Schwab OAuth Error</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; }}
                .error {{ color: red; }}
            </style>
        </head>
        <body>
            <h1 class="error">❌ OAuth Error</h1>
            <p>Failed to exchange authorization code: {str(e)}</p>
        </body>
        </html>
        """
        return HTMLResponse(content=error_html, status_code=500)

@router.get("/token/status", response_model=TokenStatus)
async def token_status():
    """
    Check Schwab access token status without making external API calls.
    Returns token validity, staleness, age, and credential availability.
    """
    try:
        # Import here to avoid circular imports
        from ..clients.schwab.auth import SchwabTokenManager

        token_manager = SchwabTokenManager()

        # Check if credentials are available
        if not token_manager.credentials_available:
            return TokenStatus(
                valid=False,
                stale=True,
                credentials_available=False,
                message="Schwab credentials not configured (missing CLIENT_ID, CLIENT_SECRET, or REFRESH_TOKEN)"
            )

        # Check token staleness
        is_stale = token_manager.is_token_stale()
        has_token = token_manager._access_token is not None
        obtained_at = token_manager._obtained_at

        # Calculate age and expiry info
        age_seconds = None
        expires_in = None
        if obtained_at:
            age_seconds = time.time() - obtained_at
            expires_in = max(0, int(token_manager.stale_token_seconds - age_seconds))

        return TokenStatus(
            valid=has_token and not is_stale,
            stale=is_stale,
            obtained_at=obtained_at,
            age_seconds=age_seconds,
            expires_in=expires_in,
            credentials_available=token_manager.credentials_available,
            message="Token valid and fresh" if (has_token and not is_stale) else
                   "Token stale or missing - will refresh on next API call" if has_token else
                   "No token cached - will obtain on next API call"
        )
    except Exception as e:
        return TokenStatus(
            valid=False,
            stale=True,
            credentials_available=False,
            message=f"Error checking token status: {str(e)}"
        )

@router.post("/token/refresh")
async def refresh_token():
    """
    Force refresh the Schwab access token using the stored refresh token.
    Returns the new token info or error details.
    """
    try:
        from ..clients.schwab.auth import SchwabTokenManager

        token_manager = SchwabTokenManager()

        if not token_manager.credentials_available:
            raise HTTPException(
                status_code=400,
                detail="Missing credentials (CLIENT_ID, CLIENT_SECRET, or REFRESH_TOKEN)"
            )

        # Force refresh the token
        new_token = token_manager.refresh_access_token()  # Direct call to refresh

        if not new_token:
            raise HTTPException(
                status_code=500,
                detail="Failed to refresh token - check credentials and refresh token validity"
            )

        # Get updated token info
        obtained_at = token_manager._obtained_at
        age_seconds = time.time() - obtained_at if obtained_at else 0
        expires_in = max(0, int(token_manager.stale_token_seconds - age_seconds))

        return {
            "success": True,
            "message": "Token refreshed successfully",
            "expires_in": expires_in,
            "obtained_at": obtained_at,
            "new_access_token": new_token[:20] + "..." if new_token else None  # Show partial token for confirmation
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token refresh failed: {str(e)}")

@router.get("/quotes/{symbol}")
async def get_quote(symbol: str):
    """Get stock quote for symbol"""
    try:
        schwab_symbol = to_schwab_symbol(symbol)
        endpoint = f"/marketdata/v1/{urllib.parse.quote(schwab_symbol)}/quotes"
        response = schwab_client.get(endpoint)
        data = response.json()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/quotes")
async def get_multiple_quotes(symbols: str = Query(..., description="Comma-separated list of symbols")):
    """Get quotes for multiple symbols"""
    try:
        symbol_list = [s.strip() for s in symbols.split(",")]
        schwab_symbols = [to_schwab_symbol(s) for s in symbol_list]
        encoded_symbols = urllib.parse.quote(",".join(schwab_symbols))
        
        endpoint = f"/marketdata/v1/quotes?symbols={encoded_symbols}"
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
        endpoint = f"/marketdata/v1/pricehistory"
        
        params = {
            "symbol": schwab_symbol,
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

@router.get("/history/{symbol}/daily", response_model=List[BarResponse])
async def get_daily_history(
    symbol: str,
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD")
):
    """
    Get daily OHLCV bars for a single symbol.
    Returns bars in ascending date order.
    NO MOCK DATA - uses real Schwab API only.
    """
    try:
        provider = get_history_provider()
        bars = provider.get_daily_history(symbol, start, end)
        
        return [
            BarResponse(
                date=bar.date,
                open=bar.open,
                high=bar.high,
                low=bar.low,
                close=bar.close,
                volume=bar.volume
            )
            for bar in bars
        ]
        
    except ProviderError as e:
        if e.status_code == 404:
            raise HTTPException(status_code=404, detail=e.message)
        else:
            raise HTTPException(status_code=500, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/history/fetch", response_model=FetchHistoryResponse)
async def fetch_price_history(
    symbols: List[str],
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD")
):
    """
    Fetch daily price history for multiple symbols.
    Returns structured bars data that can be consumed by the backend.
    NO MOCK DATA - uses real Schwab API only.
    """
    start_time = time.time()
    
    # Validate request
    if not symbols:
        raise HTTPException(status_code=400, detail="Symbols list cannot be empty")
    
    if len(symbols) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 symbols allowed per request")
    
    # Get sleep configuration
    sleep_ms = int(os.getenv("SCHWAB_REQ_SLEEP_MS", "250"))
    
    results = []
    provider = get_history_provider()
    
    for i, symbol in enumerate(symbols):
        symbol = symbol.strip().upper()
        
        if not symbol:
            results.append(SymbolResult(
                symbol=symbol,
                bars_count=0,
                error="Empty symbol"
            ))
            continue
        
        try:
            # Sleep between symbols for politeness (except first)
            if i > 0 and sleep_ms > 0:
                time.sleep(sleep_ms / 1000.0)
            
            # Fetch price history - REAL API ONLY
            bars = provider.get_daily_history(symbol, start, end)
            
            results.append(SymbolResult(
                symbol=symbol,
                bars_count=len(bars),
                error=None
            ))
            
        except ProviderError as e:
            results.append(SymbolResult(
                symbol=symbol,
                bars_count=0,
                error=f"Provider error {e.status_code}: {e.message}" if e.status_code else e.message
            ))
        except Exception as e:
            results.append(SymbolResult(
                symbol=symbol,
                bars_count=0,
                error=str(e)
            ))
    
    duration = time.time() - start_time
    
    return FetchHistoryResponse(
        start=start,
        end=end,
        results=results,
        duration_s=round(duration, 2)
    )

@router.get("/instruments/search")
async def search_instruments(
    symbol: str = Query(..., description="Symbol to search for"),
    projection: str = Query("symbol-search", description="symbol-search, symbol-regex, desc-search, desc-regex, fundamental")
):
    """Search for instruments"""
    try:
        endpoint = "/marketdata/v1/instruments"
        params = {
            "symbol": symbol,
            "projection": projection
        }
        
        response = schwab_client.get(endpoint, params=params)
        data = response.json()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))