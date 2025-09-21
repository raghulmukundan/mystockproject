"""
Price fetching API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timezone
from pydantic import BaseModel
import logging
import httpx
import asyncio

from app.core.database import get_db
from app.core.config import EXTERNAL_APIS_SERVICE_URL
from app.models.current_price import CurrentPrice

logger = logging.getLogger(__name__)

router = APIRouter()

class PriceFetchRequest(BaseModel):
    symbols: List[str]

class PriceResponse(BaseModel):
    symbol: str
    current_price: float
    change: float
    change_percent: float
    volume: int
    high: float
    low: float
    open: float
    date: str

class PriceFetchAndStoreResponse(BaseModel):
    success: bool
    symbols_processed: List[str]
    symbols_failed: List[str]
    total_stored: int
    message: str

class PriceFromDBResponse(BaseModel):
    symbol: str
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    source: str

async def fetch_prices_from_finnhub(symbols: List[str]) -> Dict[str, Any]:
    """Fetch prices from external API service (Finnhub)"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Call external API service with rate limiting built-in
            symbol_param = ",".join(symbols)
            base_url = EXTERNAL_APIS_SERVICE_URL.rstrip("/")
            response = await client.get(f"{base_url}/finnhub/quotes", params={"symbols": symbol_param})
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as http_err:
                logger.error("Finnhub quotes request failed %s %s - body: %s", http_err.response.status_code, http_err.request.url, http_err.response.text)
                raise
            return response.json()
    except Exception as e:
        logger.error(f"Failed to fetch prices from Finnhub: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch prices: {str(e)}")

@router.post("/fetch-and-store", response_model=PriceFetchAndStoreResponse)
async def fetch_and_store_prices(request: PriceFetchRequest, db: Session = Depends(get_db)):
    """
    Endpoint 2: Fetch prices from Finnhub and store in current_prices table
    Uses rate limiting built into Finnhub client
    """
    try:
        symbols = [s.upper().strip() for s in request.symbols if s.strip()]
        if not symbols:
            raise HTTPException(status_code=400, detail="No valid symbols provided")

        logger.info(f"Fetching and storing current prices for {len(symbols)} symbols")

        # Fetch prices from Finnhub (with rate limiting)
        prices_data = await fetch_prices_from_finnhub(symbols)

        if not prices_data:
            return PriceFetchAndStoreResponse(
                success=False,
                symbols_processed=[],
                symbols_failed=symbols,
                total_stored=0,
                message="No price data received from Finnhub"
            )

        # Store prices in current_prices table
        symbols_processed = []
        symbols_failed = []

        for symbol, price_info in prices_data.items():
            try:
                if not price_info or 'current_price' not in price_info:
                    symbols_failed.append(symbol)
                    continue

                # Check if price already exists
                existing_price = db.query(CurrentPrice).filter(
                    CurrentPrice.symbol == symbol
                ).first()

                if existing_price:
                    # Update existing record
                    existing_price.current_price = price_info['current_price']
                    existing_price.change_amount = price_info.get('change', 0.0)
                    existing_price.change_percent = price_info.get('change_percent', 0.0)
                    existing_price.volume = price_info.get('volume', 0)
                    existing_price.market_cap = None  # Not available from Finnhub quotes
                    existing_price.last_updated = datetime.now(timezone.utc)
                    existing_price.source = "finnhub"
                else:
                    # Create new record
                    current_price = CurrentPrice(
                        symbol=symbol,
                        current_price=price_info['current_price'],
                        change_amount=price_info.get('change', 0.0),
                        change_percent=price_info.get('change_percent', 0.0),
                        volume=price_info.get('volume', 0),
                        market_cap=None,  # Not available from Finnhub quotes
                        last_updated=datetime.now(timezone.utc),
                        source="finnhub"
                    )
                    db.add(current_price)

                symbols_processed.append(symbol)
                logger.debug(f"Stored current price for {symbol}: ${price_info['current_price']}")

            except Exception as symbol_error:
                logger.error(f"Failed to store current price for {symbol}: {symbol_error}")
                symbols_failed.append(symbol)

        # Commit all changes
        db.commit()

        message = f"Successfully stored current prices for {len(symbols_processed)} symbols"
        if symbols_failed:
            message += f", {len(symbols_failed)} failed"

        return PriceFetchAndStoreResponse(
            success=len(symbols_processed) > 0,
            symbols_processed=symbols_processed,
            symbols_failed=symbols_failed,
            total_stored=len(symbols_processed),
            message=message
        )

    except Exception as e:
        logger.error(f"Error in fetch_and_store_prices: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/get-from-db", response_model=List[PriceFromDBResponse])
async def get_prices_from_db(request: PriceFetchRequest, db: Session = Depends(get_db)):
    """
    Endpoint 3: Get current prices from current_prices table (no rate limiting)
    """
    try:
        symbols = [s.upper().strip() for s in request.symbols if s.strip()]
        if not symbols:
            raise HTTPException(status_code=400, detail="No valid symbols provided")

        logger.info(f"Fetching current prices from database for {len(symbols)} symbols")

        results = []
        for symbol in symbols:
            # Get the current price for this symbol
            current_price = db.query(CurrentPrice).filter(
                CurrentPrice.symbol == symbol
            ).first()

            if current_price:
                results.append(PriceFromDBResponse(
                    symbol=current_price.symbol,
                    date=current_price.last_updated.strftime('%Y-%m-%d') if current_price.last_updated else "",
                    open=current_price.current_price,  # Use current price for all OHLC since it's real-time
                    high=current_price.current_price,
                    low=current_price.current_price,
                    close=current_price.current_price,
                    volume=current_price.volume or 0,
                    source=current_price.source or "finnhub"
                ))

        logger.info(f"Found current prices for {len(results)} out of {len(symbols)} symbols")
        return results

    except Exception as e:
        logger.error(f"Error in get_prices_from_db: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/latest/{symbol}", response_model=Optional[PriceFromDBResponse])
async def get_latest_price_for_symbol(symbol: str, db: Session = Depends(get_db)):
    """
    Get current price for a single symbol from current_prices table
    """
    try:
        symbol = symbol.upper().strip()

        current_price = db.query(CurrentPrice).filter(
            CurrentPrice.symbol == symbol
        ).first()

        if not current_price:
            return None

        return PriceFromDBResponse(
            symbol=current_price.symbol,
            date=current_price.last_updated.strftime('%Y-%m-%d') if current_price.last_updated else "",
            open=current_price.current_price,  # Use current price for all OHLC since it's real-time
            high=current_price.current_price,
            low=current_price.current_price,
            close=current_price.current_price,
            volume=current_price.volume or 0,
            source=current_price.source or "finnhub"
        )

    except Exception as e:
        logger.error(f"Error getting current price for {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))