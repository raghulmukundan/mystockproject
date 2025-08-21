from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import logging

from app.services.market.service import market_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/market", tags=["market"])

@router.get("/candles")
async def get_market_candles(
    symbol: str = Query(..., description="Stock symbol (e.g., AAPL)"),
    range: Optional[str] = Query("6m", description="Time range (e.g., 6m, 1y)")
):
    """
    Get daily candle data for a stock symbol
    Returns { symbol, bars: [...] }
    """
    try:
        logger.info(f"Fetching candles for {symbol} with range {range}")
        bars = await market_service.get_daily_candles_by_range(symbol, range)
        
        return {
            "symbol": symbol.upper(),
            "bars": bars
        }
    except Exception as e:
        logger.error(f"Error fetching candles for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching market data: {str(e)}")