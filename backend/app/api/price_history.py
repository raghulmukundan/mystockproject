"""
Price history API endpoints
"""
import time
import os
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from dotenv import load_dotenv

from app.services.external_apis_client import external_apis_client
from app.services.prices.upsert import upsert_daily, get_price_data_stats
import logging

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter()

# Request/Response models
class FetchRequest(BaseModel):
    symbols: List[str]
    start: str  # YYYY-MM-DD
    end: str    # YYYY-MM-DD
    replace_source: bool = False

class SymbolResult(BaseModel):
    symbol: str
    inserted: int
    updated: int
    skipped: int
    error: Optional[str]

class FetchResponse(BaseModel):
    start: str
    end: str
    results: List[SymbolResult]
    duration_s: float

class CheckResponse(BaseModel):
    symbol: str
    rows: int
    first: Optional[str]
    last: Optional[str]

# External APIs client is initialized globally

@router.post("/prices/history/schwab/fetch", response_model=FetchResponse)
async def fetch_schwab_price_history(request: FetchRequest):
    """
    Fetch price history from Schwab API and store in database.
    
    Body:
    {
      "symbols": ["AAPL","MSFT","BRK.B"],
      "start": "2020-01-01",
      "end": "2025-09-05",
      "replace_source": false
    }
    
    For each symbol:
    - Map via to_schwab_symbol
    - Call get_daily_history(symbol, start, end)
    - Upsert into prices_daily with source='schwab'
    - If replace_source=true, keep same upsert but always set source='schwab'
    """
    start_time = time.time()
    
    # Validate request
    if not request.symbols:
        raise HTTPException(status_code=400, detail="Symbols list cannot be empty")
    
    if len(request.symbols) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 symbols allowed per request")
    
    # Get sleep configuration
    sleep_ms = int(os.getenv("SCHWAB_REQ_SLEEP_MS", "250"))
    
    results = []
    
    for i, symbol in enumerate(request.symbols):
        symbol = symbol.strip().upper()
        
        if not symbol:
            results.append(SymbolResult(
                symbol=symbol,
                inserted=0,
                updated=0,
                skipped=0,
                error="Empty symbol"
            ))
            continue
        
        try:
            # Sleep between symbols for politeness (except first)
            if i > 0 and sleep_ms > 0:
                time.sleep(sleep_ms / 1000.0)
            
            # Use external APIs service ONLY - no fallback
            logger.info(f"Fetching {symbol} from external APIs service (no fallback)")
            bars_data = await external_apis_client.get_schwab_daily_history(symbol, request.start, request.end)
            
            if bars_data is None:
                # No fallback - service must be available
                raise Exception(f"External APIs service unavailable for {symbol}")
            
            # Convert external API response to Bar objects
            logger.info(f"External APIs service returned {len(bars_data)} bars for {symbol}")
            from dataclasses import dataclass
            
            @dataclass
            class Bar:
                date: str
                open: float
                high: float
                low: float
                close: float
                volume: int
            
            bars = [
                Bar(
                    date=bar_data["date"],
                    open=bar_data["open"],
                    high=bar_data["high"],
                    low=bar_data["low"],
                    close=bar_data["close"],
                    volume=bar_data["volume"]
                )
                for bar_data in bars_data
            ]
            
            # Upsert into database
            source = "schwab"  # Always use schwab as source
            counts = upsert_daily(symbol, bars, source)
            
            results.append(SymbolResult(
                symbol=symbol,
                inserted=counts["inserted"],
                updated=counts["updated"],
                skipped=counts["skipped"],
                error=None
            ))
            
        except Exception as e:
            # Continue processing other symbols on error
            results.append(SymbolResult(
                symbol=symbol,
                inserted=0,
                updated=0,
                skipped=0,
                error=str(e)
            ))
    
    duration = time.time() - start_time
    
    return FetchResponse(
        start=request.start,
        end=request.end,
        results=results,
        duration_s=round(duration, 2)
    )

@router.get("/prices/history/check", response_model=CheckResponse)
async def check_price_history(
    symbol: str = Query(..., description="Stock symbol to check"),
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD")
):
    """
    Check existing price data for a symbol and date range.
    
    Query: symbol=AAPL&start=2023-01-01&end=2023-12-31
    
    Returns counts already present in DB for that range:
    {"symbol":"AAPL","rows":1260,"first":"2020-01-02","last":"2025-09-04"}
    """
    try:
        symbol = symbol.strip().upper()
        
        if not symbol:
            raise HTTPException(status_code=400, detail="Symbol cannot be empty")
        
        stats = get_price_data_stats(symbol, start, end)
        
        return CheckResponse(
            symbol=stats["symbol"],
            rows=stats["rows"],
            first=stats["first"],
            last=stats["last"]
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check price history: {str(e)}")

@router.get("/prices/history/test/connectivity")
async def test_connectivity():
    """
    Test connectivity to external APIs service and demonstrate fallback.
    Returns which service was used for the test.
    """
    try:
        # Test external APIs service
        logger.info("Testing external APIs service connectivity")
        auth_status = await external_apis_client.get_schwab_auth_status()
        
        if auth_status is not None:
            logger.info("External APIs service is available")
            return {
                "external_service": "available",
                "auth_status": auth_status,
                "fallback_required": False,
                "message": "External APIs service is working correctly"
            }
        else:
            logger.error("External APIs service is unavailable - NO FALLBACK AVAILABLE")
            return {
                "external_service": "unavailable",
                "fallback_available": False,
                "message": "External APIs service is required and unavailable"
            }
                
    except Exception as e:
        logger.error(f"Connectivity test failed: {e}")
        raise HTTPException(status_code=500, detail=f"Connectivity test failed: {str(e)}")