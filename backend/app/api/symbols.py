from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from sqlalchemy import text
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/symbols", tags=["symbols"])

class SymbolSearchResult(BaseModel):
    symbol: str
    security_name: str
    listing_exchange: str | None = None
    market_category: str | None = None

@router.get("/search", response_model=List[SymbolSearchResult])
def search_symbols(
    q: str = Query(..., min_length=1, max_length=50, description="Search query for symbol or company name"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results to return"),
    db: Session = Depends(get_db)
):
    """Search symbols by symbol name or security name"""
    try:
        search_term = f"%{q.upper()}%"

        # Search in both symbol and security_name fields
        query = text("""
            SELECT symbol, security_name, listing_exchange, market_category
            FROM symbols
            WHERE UPPER(symbol) LIKE :search_term
               OR UPPER(security_name) LIKE :search_term
            ORDER BY
                CASE
                    WHEN UPPER(symbol) = :exact_match THEN 1
                    WHEN UPPER(symbol) LIKE :starts_with THEN 2
                    WHEN UPPER(security_name) LIKE :starts_with_name THEN 3
                    ELSE 4
                END,
                symbol ASC
            LIMIT :limit
        """)

        result = db.execute(query, {
            "search_term": search_term,
            "exact_match": q.upper(),
            "starts_with": f"{q.upper()}%",
            "starts_with_name": f"{q.upper()}%",
            "limit": limit
        }).fetchall()

        symbols = []
        for row in result:
            symbols.append(SymbolSearchResult(
                symbol=row[0],
                security_name=row[1],
                listing_exchange=row[2],
                market_category=row[3]
            ))

        logger.info(f"Symbol search for '{q}' returned {len(symbols)} results")
        return symbols

    except Exception as e:
        logger.error(f"Error searching symbols: {str(e)}")
        raise HTTPException(status_code=500, detail="Error searching symbols")

@router.get("/validate/{symbol}")
def validate_symbol(symbol: str, db: Session = Depends(get_db)):
    """Validate if a symbol exists in our database"""
    try:
        symbol = symbol.upper().strip()

        result = db.execute(
            text("SELECT symbol, security_name FROM symbols WHERE symbol = :symbol LIMIT 1"),
            {"symbol": symbol}
        ).fetchone()

        if result:
            return {
                "valid": True,
                "symbol": result[0],
                "security_name": result[1]
            }
        else:
            return {
                "valid": False,
                "symbol": symbol,
                "message": "Symbol not found"
            }

    except Exception as e:
        logger.error(f"Error validating symbol {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail="Error validating symbol")

@router.get("/", response_model=List[SymbolSearchResult])
def get_all_symbols(
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of symbols to return"),
    offset: int = Query(0, ge=0, description="Number of symbols to skip"),
    db: Session = Depends(get_db)
):
    """Get all symbols with pagination"""
    try:
        result = db.execute(
            text("""
                SELECT symbol, security_name, listing_exchange, market_category
                FROM symbols
                ORDER BY symbol ASC
                LIMIT :limit OFFSET :offset
            """),
            {"limit": limit, "offset": offset}
        ).fetchall()

        symbols = []
        for row in result:
            symbols.append(SymbolSearchResult(
                symbol=row[0],
                security_name=row[1],
                listing_exchange=row[2],
                market_category=row[3]
            ))

        logger.info(f"Retrieved {len(symbols)} symbols (offset: {offset}, limit: {limit})")
        return symbols

    except Exception as e:
        logger.error(f"Error getting symbols: {str(e)}")
        raise HTTPException(status_code=500, detail="Error getting symbols")