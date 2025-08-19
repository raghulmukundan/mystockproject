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
    """Get current stock price for a single symbol"""
    try:
        price_data = await stock_data_service.get_stock_price(symbol)
        if not price_data:
            raise HTTPException(status_code=404, detail=f"Stock price not found for {symbol}")
        
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
    """Get current stock prices for multiple symbols"""
    try:
        if len(symbols) > 50:  # Limit to prevent abuse
            raise HTTPException(status_code=400, detail="Maximum 50 symbols allowed per request")
        
        logger.info(f"Received request for {len(symbols)} stock prices")
        price_data = await stock_data_service.get_multiple_stock_prices(symbols)
        logger.info(f"Returning {len(price_data)} stock prices")
        
        response = {}
        for symbol, data in price_data.items():
            response[symbol] = StockPriceResponse(
                symbol=data.symbol,
                current_price=data.current_price,
                change=data.change,
                change_percent=data.change_percent,
                volume=data.volume,
                market_cap=data.market_cap
            )
        
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
            # Return mock profile data for development
            mock_profiles = {
                'AAPL': {
                    'name': 'Apple Inc.',
                    'sector': 'Technology',
                    'industry': 'Consumer Electronics',
                    'market_cap': 2800000000000,
                    'description': 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.'
                },
                'GOOGL': {
                    'name': 'Alphabet Inc.',
                    'sector': 'Communication Services',
                    'industry': 'Internet Content & Information',
                    'market_cap': 1600000000000,
                    'description': 'Alphabet Inc. provides online advertising services in the United States, Europe, the Middle East, Africa, the Asia-Pacific, Canada, and Latin America.'
                },
                'MSFT': {
                    'name': 'Microsoft Corporation',
                    'sector': 'Technology',
                    'industry': 'Software—Infrastructure',
                    'market_cap': 2600000000000,
                    'description': 'Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide.'
                },
                'TSLA': {
                    'name': 'Tesla, Inc.',
                    'sector': 'Consumer Cyclical',
                    'industry': 'Auto Manufacturers',
                    'market_cap': 750000000000,
                    'description': 'Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, and energy generation and storage systems in the United States, China, and internationally.'
                },
                'COST': {
                    'name': 'Costco Wholesale Corporation',
                    'sector': 'Consumer Staples',
                    'industry': 'Discount Stores',
                    'market_cap': 305000000000,
                    'description': 'Costco Wholesale Corporation operates membership warehouses and e-commerce websites.'
                },
                'TPR': {
                    'name': 'Tapestry, Inc.',
                    'sector': 'Consumer Cyclical',
                    'industry': 'Luxury Goods',
                    'market_cap': 12000000000,
                    'description': 'Tapestry, Inc. provides luxury accessories and branded lifestyle products.'
                },
                'GE': {
                    'name': 'General Electric Company',
                    'sector': 'Industrials',
                    'industry': 'Conglomerates',
                    'market_cap': 125000000000,
                    'description': 'General Electric Company operates as a high-tech industrial company worldwide.'
                },
                'DE': {
                    'name': 'Deere & Company',
                    'sector': 'Industrials',
                    'industry': 'Farm & Heavy Construction Machinery',
                    'market_cap': 125000000000,
                    'description': 'Deere & Company manufactures and distributes various equipment worldwide.'
                },
                'CAT': {
                    'name': 'Caterpillar Inc.',
                    'sector': 'Industrials',
                    'industry': 'Farm & Heavy Construction Machinery',
                    'market_cap': 155000000000,
                    'description': 'Caterpillar Inc. manufactures construction and mining equipment, diesel and natural gas engines, industrial gas turbines, and diesel-electric locomotives worldwide.'
                },
                'XOM': {
                    'name': 'Exxon Mobil Corporation',
                    'sector': 'Energy',
                    'industry': 'Oil & Gas Integrated',
                    'market_cap': 405000000000,
                    'description': 'Exxon Mobil Corporation explores for and produces crude oil and natural gas.'
                },
                'CVX': {
                    'name': 'Chevron Corporation',
                    'sector': 'Energy',
                    'industry': 'Oil & Gas Integrated',
                    'market_cap': 275000000000,
                    'description': 'Chevron Corporation engages in integrated energy, chemicals, and petroleum operations worldwide.'
                },
                'JPM': {
                    'name': 'JPMorgan Chase & Co.',
                    'sector': 'Financial Services',
                    'industry': 'Banks—Diversified',
                    'market_cap': 485000000000,
                    'description': 'JPMorgan Chase & Co. operates as a financial services company worldwide.'
                }
            }
            
            mock_data = mock_profiles.get(symbol.upper())
            if mock_data:
                return CompanyProfileResponse(
                    symbol=symbol.upper(),
                    company_name=mock_data['name'],
                    sector=mock_data['sector'],
                    industry=mock_data['industry'],
                    market_cap=mock_data['market_cap'],
                    description=mock_data['description'],
                    country='US',
                    exchange='NASDAQ'
                )
            
            # Default fallback
            return CompanyProfileResponse(
                symbol=symbol.upper(),
                company_name=f"{symbol.upper()} Corporation",
                sector='Technology',
                industry='Software',
                market_cap=None,
                description=f"Information for {symbol.upper()} is not available.",
                country='US',
                exchange='NASDAQ'
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
    return stock_data_service.get_cache_stats()

@router.post("/clear-cache")
async def clear_cache():
    """Clear the stock data cache"""
    stock_data_service.clear_cache()
    return {"message": "Cache cleared successfully"}