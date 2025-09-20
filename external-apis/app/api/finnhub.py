"""
Finnhub API endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, Optional, List
from ..clients.finnhub.client import FinnhubClient

router = APIRouter()

# Initialize client
finnhub_client = FinnhubClient()

@router.get("/health")
async def finnhub_health():
    """Health check for Finnhub service"""
    try:
        # Simple test call to verify API key works
        finnhub_client.get_quote("AAPL")
        return {"status": "healthy", "api_key_configured": bool(finnhub_client.api_key)}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    """Get stock quote for symbol"""
    try:
        data = finnhub_client.get_quote(symbol.upper())
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/quotes")
async def get_quotes(symbols: str = Query(..., description="Comma-separated list of symbols")):
    """Get stock quotes for multiple symbols"""
    try:
        symbol_list = [s.strip().upper() for s in symbols.split(",")]
        result = {}
        
        for symbol in symbol_list:
            try:
                quote_data = finnhub_client.get_quote(symbol)
                if quote_data:
                    result[symbol] = {
                        'current_price': quote_data.get('c', 0.0),  # Current price
                        'change': quote_data.get('d', 0.0),         # Change amount
                        'change_percent': quote_data.get('dp', 0.0), # Change percent
                        'volume': quote_data.get('v', 0),           # Volume (if available)
                        'high': quote_data.get('h', 0.0),           # High
                        'low': quote_data.get('l', 0.0),            # Low
                        'open': quote_data.get('o', 0.0)            # Open
                    }
            except Exception as symbol_error:
                # Log error but continue with other symbols
                print(f"Error fetching data for {symbol}: {symbol_error}")
                continue
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/company/{symbol}")
async def get_company_profile(symbol: str):
    """Get company profile information"""
    try:
        data = finnhub_client.get_company_profile(symbol.upper())
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/metrics/{symbol}")
async def get_stock_metrics(
    symbol: str,
    metric: str = Query("all", description="Metric type (all, price, valuation, etc.)")
):
    """Get stock metrics"""
    try:
        data = finnhub_client.get_stock_metrics(symbol.upper(), metric)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/news")
async def get_market_news(
    category: str = Query("general", description="News category"),
    min_id: Optional[str] = Query(None, description="Minimum news ID for pagination")
):
    """Get market news"""
    try:
        data = finnhub_client.get_news(category, min_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/company-news/{symbol}")
async def get_company_news(
    symbol: str,
    from_date: str = Query(..., description="From date (YYYY-MM-DD)"),
    to_date: str = Query(..., description="To date (YYYY-MM-DD)")
):
    """Get company-specific news"""
    try:
        data = finnhub_client.get_company_news(symbol.upper(), from_date, to_date)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))