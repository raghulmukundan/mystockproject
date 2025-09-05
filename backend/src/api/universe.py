from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.services.universe.service import UniverseService

router = APIRouter(prefix="/api/universe", tags=["universe"])

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

# Initialize service
universe_service = UniverseService()

@router.post("/refresh", response_model=RefreshResponse)
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

@router.get("/stats", response_model=StatsResponse)
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

@router.get("/facets", response_model=FacetsResponse)
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