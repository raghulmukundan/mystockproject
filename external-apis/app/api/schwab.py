"""
Schwab API endpoints
"""
import time
import os
from fastapi import APIRouter, HTTPException, Query
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