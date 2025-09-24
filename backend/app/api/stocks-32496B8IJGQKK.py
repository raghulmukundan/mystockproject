from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from app.services.stock_data import stock_data_service, StockPrice, CompanyProfile
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
    """Get current stock price for a single symbol from prices_daily table"""
    try:
        # Use our new prices endpoint to get data from prices_daily table
        import httpx

        async with httpx.AsyncClient() as client:
            response_data = await client.get(
                f"http://backend:8002/api/prices/latest/{symbol}",
                timeout=30.0
            )
            response_data.raise_for_status()
            price_record = response_data.json()

        if not price_record:
            raise HTTPException(
                status_code=404,
                detail=f"Price not available for {symbol}"
            )

        return StockPriceResponse(
            symbol=price_record['symbol'],
            current_price=price_record['close'],  # Use close price as current price
            change=0.0,  # TODO: Calculate daily change if needed
            change_percent=0.0,  # TODO: Calculate daily change percent if needed
            volume=price_record['volume'],
            market_cap=None  # Not available in prices_daily
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stock price: {str(e)}")

@router.get("/prices", response_model=Dict[str, StockPriceResponse])
async def get_multiple_stock_prices(symbols: List[str] = Query(..., description="List of stock symbols")):
    """Get current stock prices for multiple symbols from prices_daily table"""
    try:
        if len(symbols) > 50:  # Limit to prevent abuse
            raise HTTPException(status_code=400, detail="Maximum 50 symbols allowed per request")

        logger.info(f"Received request for {len(symbols)} stock prices from database")

        # Use our new prices endpoint to get data from prices_daily table
        import httpx

        async with httpx.AsyncClient() as client:
            payload = {"symbols": symbols}
            response_data = await client.post(
                "http://backend:8002/api/prices/get-from-db",
                json=payload,
                timeout=30.0
            )
            response_data.raise_for_status()
            prices_from_db = response_data.json()

        response = {}

        for price_record in prices_from_db:
            symbol = price_record['symbol']
            response[symbol] = StockPriceResponse(
                symbol=symbol,
                current_price=price_record['close'],  # Use close price as current price
                change=0.0,  # TODO: Calculate daily change if needed
                change_percent=0.0,  # TODO: Calculate daily change percent if needed
                volume=price_record['volume'],
                market_cap=None  # Not available in prices_daily
            )

        # Check for missing symbols
        found_symbols = set(response.keys())
        requested_symbols = set(symbols)
        missing_symbols = requested_symbols - found_symbols

        if missing_symbols:
            logger.warning(f"No price data found for symbols: {list(missing_symbols)}")
            # Don't fail, just return what we have

        logger.info(f"Returning {len(response)} stock prices from prices_daily table")
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

