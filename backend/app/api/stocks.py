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
        
        # Fallback to direct API call with market-aware logic
        market_open = price_cache_service._is_market_open()
        
        # Check if symbol is in a watchlist
        from app.models.watchlist_item import WatchlistItem
        from app.core.database import get_db
        
        db = next(get_db())
        try:
            is_watchlist_symbol = db.query(WatchlistItem).filter(WatchlistItem.symbol == symbol).first() is not None
        finally:
            db.close()
        
        # Only fetch from API if market is open OR symbol is not in watchlists
        if market_open or not is_watchlist_symbol:
            logger.info(f"Fetching price for {symbol} from API (market_open: {market_open}, in_watchlist: {is_watchlist_symbol})")
            price_data = await stock_data_service.get_stock_price(symbol)
            if not price_data:
                raise HTTPException(status_code=404, detail=f"Stock price not found for {symbol}")
            
            # Cache the result for future requests
            await price_cache_service.force_refresh_symbol(symbol)
        else:
            logger.info(f"Market closed and {symbol} is in watchlist - no price data available")
            raise HTTPException(status_code=404, detail=f"Market closed - cached price not available for {symbol}")
        
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
        
        # If we have missing symbols, fetch them directly (fallback)
        if missing_symbols:
            market_open = price_cache_service._is_market_open()
            
            # Check which missing symbols are in watchlists
            from app.models.watchlist_item import WatchlistItem
            from app.core.database import get_db
            
            db = next(get_db())
            try:
                watchlist_symbols = set([item.symbol for item in db.query(WatchlistItem.symbol).distinct().all()])
            finally:
                db.close()
            
            missing_watchlist = [s for s in missing_symbols if s in watchlist_symbols]
            missing_non_watchlist = [s for s in missing_symbols if s not in watchlist_symbols]
            
            symbols_to_fetch = []
            
            if market_open:
                # Market open: fetch all missing symbols
                symbols_to_fetch = missing_symbols
                logger.info(f"Market open - fetching {len(missing_symbols)} symbols from API: {missing_symbols}")
            else:
                # Market closed: only fetch non-watchlist symbols (allow viewing new symbols)
                symbols_to_fetch = missing_non_watchlist
                if missing_watchlist:
                    logger.info(f"Market closed - skipping {len(missing_watchlist)} watchlist symbols: {missing_watchlist}")
                if missing_non_watchlist:
                    logger.info(f"Market closed - fetching {len(missing_non_watchlist)} non-watchlist symbols: {missing_non_watchlist}")
            
            if symbols_to_fetch:
                fallback_data = await stock_data_service.get_multiple_stock_prices(symbols_to_fetch)
                
                for symbol, data in fallback_data.items():
                    response[symbol] = StockPriceResponse(
                        symbol=data.symbol,
                        current_price=data.current_price,
                        change=data.change,
                        change_percent=data.change_percent,
                        volume=data.volume,
                        market_cap=data.market_cap
                    )
                    # Cache the result for future requests
                    await price_cache_service.force_refresh_symbol(symbol)
        
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