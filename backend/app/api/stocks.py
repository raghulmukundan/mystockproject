from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.services.stock_data import stock_data_service, StockPrice, CompanyProfile
from app.core.database import get_db
from app.models.realtime_price_cache import RealtimePriceCache
from pydantic import BaseModel
import logging
import httpx

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
async def get_stock_price(symbol: str, db: Session = Depends(get_db)):
    """Get current stock price for a single symbol from prices_realtime_cache table"""
    try:
        symbol = symbol.upper().strip()

        # Query prices_realtime_cache table directly
        current_price = db.query(RealtimePriceCache).filter(
            RealtimePriceCache.symbol == symbol
        ).first()

        if not current_price:
            logger.info(f"No price data found for {symbol}, fetching from Finnhub")

            # Fetch missing price from Finnhub and store in DB
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    payload = {"symbols": [symbol]}
                    fetch_response = await client.post(
                        "http://backend:8000/api/prices/fetch-and-store",
                        json=payload
                    )

                    if fetch_response.status_code == 200:
                        fetch_data = fetch_response.json()
                        logger.info(f"Successfully fetched price for {symbol} from Finnhub")

                        # Query the database again for the newly stored price
                        current_price = db.query(RealtimePriceCache).filter(
                            RealtimePriceCache.symbol == symbol
                        ).first()

                        if not current_price:
                            raise HTTPException(
                                status_code=404,
                                detail=f"Price not available for {symbol} even after fetching from Finnhub"
                            )
                    else:
                        logger.warning(f"Failed to fetch price for {symbol} from Finnhub: {fetch_response.status_code}")
                        raise HTTPException(
                            status_code=404,
                            detail=f"Price not available for {symbol}"
                        )

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error fetching price for {symbol} from Finnhub: {str(e)}")
                raise HTTPException(
                    status_code=404,
                    detail=f"Price not available for {symbol}"
                )

        return StockPriceResponse(
            symbol=current_price.symbol,
            current_price=current_price.current_price,
            change=current_price.change_amount or 0.0,
            change_percent=current_price.change_percent or 0.0,
            volume=current_price.volume or 0,
            market_cap=current_price.market_cap
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stock price: {str(e)}")

@router.get("/prices", response_model=Dict[str, StockPriceResponse])
async def get_multiple_stock_prices(symbols: List[str] = Query(..., description="List of stock symbols"), db: Session = Depends(get_db)):
    """Get current stock prices for multiple symbols from prices_realtime_cache table"""
    try:
        if len(symbols) > 50:  # Limit to prevent abuse
            raise HTTPException(status_code=400, detail="Maximum 50 symbols allowed per request")

        symbols = [s.upper().strip() for s in symbols if s.strip()]
        logger.info(f"Received request for {len(symbols)} stock prices from prices_realtime_cache table")

        # Query prices_realtime_cache table directly (no HTTP call needed)
        response = {}

        for symbol in symbols:
            # Get the current price for this symbol
            current_price = db.query(RealtimePriceCache).filter(
                RealtimePriceCache.symbol == symbol
            ).first()

            if current_price:
                response[symbol] = StockPriceResponse(
                    symbol=current_price.symbol,
                    current_price=current_price.current_price,
                    change=current_price.change_amount or 0.0,
                    change_percent=current_price.change_percent or 0.0,
                    volume=current_price.volume or 0,
                    market_cap=current_price.market_cap
                )

        # Check for missing symbols
        found_symbols = set(response.keys())
        requested_symbols = set(symbols)
        missing_symbols = requested_symbols - found_symbols

        if missing_symbols:
            logger.info(f"No price data found for symbols: {list(missing_symbols)}, fetching from Finnhub")

            # Fetch missing prices from Finnhub and store in DB
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    payload = {"symbols": list(missing_symbols)}
                    fetch_response = await client.post(
                        "http://backend:8000/api/prices/fetch-and-store",
                        json=payload
                    )

                    if fetch_response.status_code == 200:
                        fetch_data = fetch_response.json()
                        logger.info(f"Successfully fetched {len(fetch_data.get('prices', {}))} prices from Finnhub")

                        # Query the database again for the newly stored prices
                        for symbol in missing_symbols:
                            current_price = db.query(RealtimePriceCache).filter(
                                RealtimePriceCache.symbol == symbol
                            ).first()

                            if current_price:
                                response[symbol] = StockPriceResponse(
                                    symbol=current_price.symbol,
                                    current_price=current_price.current_price,
                                    change=current_price.change_amount or 0.0,
                                    change_percent=current_price.change_percent or 0.0,
                                    volume=current_price.volume or 0,
                                    market_cap=current_price.market_cap
                                )
                    else:
                        logger.warning(f"Failed to fetch prices from Finnhub: {fetch_response.status_code}")

            except Exception as e:
                logger.error(f"Error fetching missing prices from Finnhub: {str(e)}")
                # Continue with partial results

        logger.info(f"Returning {len(response)} stock prices from prices_realtime_cache table")
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

