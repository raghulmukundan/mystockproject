from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import io
import csv

from app.services.universe.service import UniverseService

router = APIRouter()

# Request/Response models
class RefreshRequest(BaseModel):
    download: bool = True

class RefreshResponse(BaseModel):
    inserted: int
    updated: int
    total: int
    file_path: str

class StatsResponse(BaseModel):
    count: int
    last_updated_at: Optional[str]

class FacetsResponse(BaseModel):
    exchanges: list[str]
    etf_flags: list[str]
    counts: dict

class NextRefreshResponse(BaseModel):
    next_refresh_time: str
    formatted_time: str
    timezone: str

class SymbolsResponse(BaseModel):
    items: List[dict]
    total: int
    limit: int
    offset: int

# Initialize service
universe_service = UniverseService()

@router.post("/universe/refresh", response_model=RefreshResponse)
async def refresh_universe(request: RefreshRequest = RefreshRequest()):
    """
    Refresh universe data by downloading and parsing nasdaqtraded.txt
    """
    try:
        result = universe_service.refresh_symbols(download=request.download)
        
        # Determine file path based on download setting
        data_dir = universe_service.downloader.data_dir
        file_name = universe_service.downloader.universe_file
        file_path = f"{data_dir}/{file_name}"
        
        return RefreshResponse(
            inserted=result['inserted'],
            updated=result['updated'], 
            total=result['total'],
            file_path=file_path
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/universe/stats", response_model=StatsResponse)
async def get_universe_stats():
    """
    Get universe statistics (total count and last update time)
    """
    try:
        stats = universe_service.get_stats()
        return StatsResponse(
            count=stats['count'],
            last_updated_at=stats['last_updated_at']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/universe/facets", response_model=FacetsResponse)
async def get_universe_facets():
    """
    Get facets for filtering (exchanges, ETF flags, counts)
    """
    try:
        facets = universe_service.get_facets()
        return FacetsResponse(
            exchanges=facets['exchanges'],
            etf_flags=facets['etf_flags'],
            counts=facets['counts']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/universe/symbols", response_model=SymbolsResponse)
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

@router.get("/universe/symbols.csv")
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

@router.delete("/universe/clear")
async def clear_universe():
    """
    Clear all universe data (for removing mock data)
    """
    try:
        result = universe_service.clear_all_symbols()
        return {"message": f"Cleared {result['deleted']} symbols from universe"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/universe/next-refresh", response_model=NextRefreshResponse)
async def get_next_refresh():
    """
    Get the next scheduled refresh time (Sunday 8:00 AM America/Chicago)
    """
    try:
        refresh_info = universe_service.get_next_refresh_time()
        return NextRefreshResponse(
            next_refresh_time=refresh_info['next_refresh_time'],
            formatted_time=refresh_info['formatted_time'],
            timezone=refresh_info['timezone']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))