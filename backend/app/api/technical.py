"""
Technical data API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import logging

from app.core.database import get_db
from src.db.models import TechnicalLatest

logger = logging.getLogger(__name__)

router = APIRouter()

class TechnicalDataRequest(BaseModel):
    symbols: List[str]

class TechnicalDataResponse(BaseModel):
    symbol: str
    date: str
    close: float
    volume: int
    sma20: Optional[float] = None
    sma50: Optional[float] = None
    sma200: Optional[float] = None
    rsi14: Optional[float] = None
    adx14: Optional[float] = None
    atr14: Optional[float] = None
    donch20_high: Optional[float] = None
    donch20_low: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    avg_vol20: Optional[float] = None
    high_252: Optional[float] = None
    distance_to_52w_high: Optional[float] = None
    rel_volume: Optional[float] = None
    sma_slope: Optional[float] = None

class TechnicalDataBatchResponse(BaseModel):
    success: bool
    data: List[TechnicalDataResponse]
    symbols_found: List[str]
    symbols_not_found: List[str]
    message: str

@router.post("/technical/latest", response_model=TechnicalDataBatchResponse)
async def get_latest_technical_data(request: TechnicalDataRequest, db: Session = Depends(get_db)):
    """
    Get latest technical data for multiple symbols from technical_latest table
    """
    try:
        symbols = [s.upper().strip() for s in request.symbols if s.strip()]
        if not symbols:
            raise HTTPException(status_code=400, detail="No valid symbols provided")

        logger.info(f"Fetching technical data for {len(symbols)} symbols")

        # Query technical_latest table for all requested symbols
        technical_data = db.query(TechnicalLatest).filter(
            TechnicalLatest.symbol.in_(symbols)
        ).all()

        # Build response data
        data = []
        symbols_found = []
        symbols_not_found = []

        # Create lookup for found data
        found_data = {tech.symbol: tech for tech in technical_data}

        for symbol in symbols:
            if symbol in found_data:
                tech = found_data[symbol]
                data.append(TechnicalDataResponse(
                    symbol=tech.symbol,
                    date=tech.date,
                    close=tech.close,
                    volume=tech.volume,
                    sma20=tech.sma20,
                    sma50=tech.sma50,
                    sma200=tech.sma200,
                    rsi14=tech.rsi14,
                    adx14=tech.adx14,
                    atr14=tech.atr14,
                    donch20_high=tech.donch20_high,
                    donch20_low=tech.donch20_low,
                    macd=tech.macd,
                    macd_signal=tech.macd_signal,
                    macd_hist=tech.macd_hist,
                    avg_vol20=tech.avg_vol20,
                    high_252=tech.high_252,
                    distance_to_52w_high=tech.distance_to_52w_high,
                    rel_volume=tech.rel_volume,
                    sma_slope=tech.sma_slope
                ))
                symbols_found.append(symbol)
            else:
                symbols_not_found.append(symbol)

        message = f"Found technical data for {len(symbols_found)} out of {len(symbols)} symbols"
        if symbols_not_found:
            message += f", {len(symbols_not_found)} symbols not found"

        logger.info(message)

        return TechnicalDataBatchResponse(
            success=len(symbols_found) > 0,
            data=data,
            symbols_found=symbols_found,
            symbols_not_found=symbols_not_found,
            message=message
        )

    except Exception as e:
        logger.error(f"Error fetching technical data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/technical/latest/{symbol}", response_model=Optional[TechnicalDataResponse])
async def get_single_technical_data(symbol: str, db: Session = Depends(get_db)):
    """
    Get latest technical data for a single symbol from technical_latest table
    """
    try:
        symbol = symbol.upper().strip()

        technical_data = db.query(TechnicalLatest).filter(
            TechnicalLatest.symbol == symbol
        ).first()

        if not technical_data:
            return None

        return TechnicalDataResponse(
            symbol=technical_data.symbol,
            date=technical_data.date,
            close=technical_data.close,
            volume=technical_data.volume,
            sma20=technical_data.sma20,
            sma50=technical_data.sma50,
            sma200=technical_data.sma200,
            rsi14=technical_data.rsi14,
            adx14=technical_data.adx14,
            atr14=technical_data.atr14,
            donch20_high=technical_data.donch20_high,
            donch20_low=technical_data.donch20_low,
            macd=technical_data.macd,
            macd_signal=technical_data.macd_signal,
            macd_hist=technical_data.macd_hist,
            avg_vol20=technical_data.avg_vol20,
            high_252=technical_data.high_252,
            distance_to_52w_high=technical_data.distance_to_52w_high,
            rel_volume=technical_data.rel_volume,
            sma_slope=technical_data.sma_slope
        )

    except Exception as e:
        logger.error(f"Error fetching technical data for {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/technical/health")
async def technical_health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint that returns technical data statistics
    """
    try:
        # Get count of symbols with technical data
        total_symbols = db.query(TechnicalLatest).count()

        # Get latest date available
        latest_entry = db.query(TechnicalLatest).order_by(TechnicalLatest.date.desc()).first()
        latest_date = latest_entry.date if latest_entry else None

        return {
            "status": "healthy",
            "total_symbols": total_symbols,
            "latest_date": latest_date,
            "message": f"Technical data available for {total_symbols} symbols"
        }

    except Exception as e:
        logger.error(f"Error in technical health check: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))