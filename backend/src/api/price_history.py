"""
Price history API endpoints
"""
import time
import os
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from dotenv import load_dotenv

from src.services.prices.providers.schwab_history import SchwabHistoryProvider
from src.services.prices.upsert import upsert_daily, get_price_data_stats

load_dotenv()

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

# Lazy provider initialization
history_provider = None

def get_history_provider():
    global history_provider
    if history_provider is None:
        history_provider = SchwabHistoryProvider()
    return history_provider

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
            
            # Fetch price history
            provider = get_history_provider()
            bars = provider.get_daily_history(symbol, request.start, request.end)
            
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