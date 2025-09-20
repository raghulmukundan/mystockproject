from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from app.services.stock_data import stock_data_service, StockPrice, CompanyProfile
from app.services.cache_service import cache_service
from app.services.price_cache_service import price_cache_service
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stocks", tags=["stocks"])

class StockPriceResponse(BaseModel):
    symbol: str
    current_price: float
    change: float
    change_percent: float
    volume: int
    market_cap: int | None = None

class CompanyProfileResponse(BaseModel):
    symbol: str
    company_name: str
    sector: str
    industry: str
    market_cap: int | None = None
    description: str | None = None
    country: str | None = None
    exchange: str = "NASDAQ"

@router.get("/prices/{symbol}", response_model=StockPriceResponse)
async def get_stock_price(symbol: str):
    """Get current stock price for a single symbol from cache"""
    try:
        # Try cached price first
        cached_price = await price_cache_service.get_cached_price(symbol)
        
        if cached_price:
            return StockPriceResponse(
                symbol=cached_price['symbol'],
                current_price=cached_price['current_price'],
                change=cached_price['change'] or 0.0,
                change_percent=cached_price['change_percent'] or 0.0,
                volume=cached_price['volume'] or 0,
                market_cap=cached_price['market_cap']
            )
        
        # No fallback - cache service required
        logger.error(f"Cached price not available for {symbol} (no fallback available)")
        raise HTTPException(
            status_code=404, 
            detail=f"Price not available for {symbol}. No fallback available."
        )
        
        return StockPriceResponse(
            symbol=price_data.symbol,
            current_price=price_data.current_price,
            change=price_data.change,
            change_percent=price_data.change_percent,
            volume=price_data.volume,
            market_cap=price_data.market_cap
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stock price: {str(e)}")

@router.get("/prices", response_model=Dict[str, StockPriceResponse])
async def get_multiple_stock_prices(symbols: List[str] = Query(..., description="List of stock symbols")):
    """Get current stock prices for multiple symbols from cache"""
    try:
        if len(symbols) > 50:  # Limit to prevent abuse
            raise HTTPException(status_code=400, detail="Maximum 50 symbols allowed per request")
        
        logger.info(f"Received request for {len(symbols)} stock prices from cache")
        
        # Get cached prices first
        cached_prices = await price_cache_service.get_cached_prices(symbols)
        
        response = {}
        missing_symbols = []
        
        for symbol in symbols:
            if symbol in cached_prices:
                data = cached_prices[symbol]
                response[symbol] = StockPriceResponse(
                    symbol=data['symbol'],
                    current_price=data['current_price'],
                    change=data['change'] or 0.0,
                    change_percent=data['change_percent'] or 0.0,
                    volume=data['volume'] or 0,
                    market_cap=data['market_cap']
                )
            else:
                missing_symbols.append(symbol)
        
        # If missing symbols, return error - no fallback allowed
        if missing_symbols:
            logger.error(f"Missing symbols from cache (no fallback available): {missing_symbols}")
            raise HTTPException(
                status_code=503, 
                detail=f"Price data not available for symbols: {', '.join(missing_symbols)}. No fallback available."
            )
        
        logger.info(f"Returning {len(response)} stock prices ({len(cached_prices)} from cache, {len(missing_symbols)} from API)")
        return response
        
    except Exception as e:
        logger.error(f"Error in get_multiple_stock_prices: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching stock prices: {str(e)}")

@router.get("/profile/{symbol}", response_model=CompanyProfileResponse)
async def get_company_profile(symbol: str):
    """Get company profile for a single symbol"""
    try:
        profile_data = await stock_data_service.get_company_profile(symbol)
        if not profile_data:
            # No mock data - external service required
            raise HTTPException(
                status_code=404, 
                detail=f"Company profile not available for {symbol}. No fallback available."
            )
        
        return CompanyProfileResponse(
            symbol=profile_data.symbol,
            company_name=profile_data.company_name,
            sector=profile_data.sector,
            industry=profile_data.industry,
            market_cap=profile_data.market_cap,
            description=profile_data.description,
            country=profile_data.country,
            exchange=profile_data.exchange
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching company profile: {str(e)}")

@router.get("/profiles", response_model=Dict[str, CompanyProfileResponse])
async def get_multiple_company_profiles(symbols: List[str] = Query(..., description="List of stock symbols")):
    """Get company profiles for multiple symbols"""
    try:
        if len(symbols) > 50:  # Limit to prevent abuse
            raise HTTPException(status_code=400, detail="Maximum 50 symbols allowed per request")
        
        profile_data = await stock_data_service.get_multiple_company_profiles(symbols)
        
        response = {}
        for symbol, data in profile_data.items():
            response[symbol] = CompanyProfileResponse(
                symbol=data.symbol,
                company_name=data.company_name,
                sector=data.sector,
                industry=data.industry,
                market_cap=data.market_cap,
                description=data.description,
                country=data.country,
                exchange=data.exchange
            )
        
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching company profiles: {str(e)}")

@router.get("/cache-stats")
async def get_cache_stats():
    """Get cache statistics for monitoring"""
    return {
        "price_cache": await price_cache_service.get_cache_stats(),
        "global_cache": cache_service.get_stats(),
        "legacy_cache": stock_data_service.get_cache_stats()
    }

@router.post("/clear-cache")
async def clear_cache():
    """Clear the stock data cache"""
    stock_data_service.clear_cache()
    cache_service.clear()
    return {"message": "Cache cleared successfully"}

@router.post("/refresh-prices")
async def refresh_all_prices(force: bool = False):
    """Manually trigger a refresh of all watchlist prices"""
    try:
        # Check market hours unless force is specified
        if not force and not price_cache_service._is_market_open():
            market_status = cache_service.get_market_status()
            return {
                "message": "Market is closed - use ?force=true to refresh anyway", 
                "market_status": market_status
            }
            
        await price_cache_service.refresh_all_watchlist_prices()
        return {"message": "Successfully refreshed all watchlist prices"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing prices: {str(e)}")

@router.post("/refresh-price/{symbol}")
async def refresh_single_price(symbol: str):
    """Manually refresh price for a single symbol"""
    try:
        success = await price_cache_service.force_refresh_symbol(symbol.upper())
        if success:
            return {"message": f"Successfully refreshed price for {symbol.upper()}"}
        else:
            raise HTTPException(status_code=404, detail=f"Could not fetch price for {symbol}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing price for {symbol}: {str(e)}")

@router.get("/market-status")
async def get_market_status():
    """Get current market status and next refresh time"""
    return cache_service.get_market_status()