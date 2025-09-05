from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import io
import csv

from src.services.universe.service import UniverseService

router = APIRouter(prefix="/api/universe", tags=["universe"])

# Response models
class SymbolData(BaseModel):
    symbol: str
    security_name: str
    listing_exchange: Optional[str]
    etf: Optional[str]
    stooq_symbol: str

class SymbolsResponse(BaseModel):
    items: List[dict]
    total: int
    limit: int
    offset: int

# Initialize service
universe_service = UniverseService()

@router.get("/symbols", response_model=SymbolsResponse)
async def query_symbols(
    q: Optional[str] = Query(None, description="Search query - symbol prefix (if <=5 chars, uppercase) or security name substring"),
    exchange: Optional[str] = Query(None, description="Filter by listing exchange"),
    etf: Optional[str] = Query(None, description="Filter by ETF flag ('Y' or 'N')"),
    limit: int = Query(50, description="Page size (max 200)", ge=1, le=200),
    offset: int = Query(0, description="Page offset", ge=0),
    sort: str = Query("symbol", description="Sort field", regex="^(symbol|security_name|listing_exchange|etf)$"),
    order: str = Query("asc", description="Sort order", regex="^(asc|desc)$")
):
    """
    Query symbols with filters, sorting, and pagination
    """
    try:
        result = universe_service.query_symbols(
            q=q,
            exchange=exchange,
            etf=etf,
            limit=limit,
            offset=offset,
            sort=sort,
            order=order
        )
        
        return SymbolsResponse(
            items=result['items'],
            total=result['total'],
            limit=result['limit'],
            offset=result['offset']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/symbols.csv")
async def export_symbols_csv(
    q: Optional[str] = Query(None, description="Search query"),
    exchange: Optional[str] = Query(None, description="Filter by listing exchange"),  
    etf: Optional[str] = Query(None, description="Filter by ETF flag ('Y' or 'N')"),
    limit: int = Query(1000, description="Export limit (max 10000)", ge=1, le=10000),
    offset: int = Query(0, description="Page offset", ge=0),
    sort: str = Query("symbol", description="Sort field", regex="^(symbol|security_name|listing_exchange|etf)$"),
    order: str = Query("asc", description="Sort order", regex="^(asc|desc)$")
):
    """
    Export symbols to CSV with same filtering as regular query
    """
    try:
        # Query symbols with filters
        result = universe_service.query_symbols(
            q=q,
            exchange=exchange,
            etf=etf,
            limit=limit,
            offset=offset,
            sort=sort,
            order=order
        )
        
        # Create CSV in memory
        output = io.StringIO()
        
        if result['items']:
            # CSV headers matching the specification
            fieldnames = [
                'symbol', 'security_name', 'listing_exchange', 'market_category',
                'test_issue', 'financial_status', 'round_lot_size', 'etf', 
                'nextshares', 'stooq_symbol', 'updated_at'
            ]
            
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            
            # Write data rows
            for item in result['items']:
                writer.writerow(item)
        
        # Prepare response
        output.seek(0)
        response = StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=symbols.csv"}
        )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))