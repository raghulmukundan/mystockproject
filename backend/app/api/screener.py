"""
Screener API Proxy
Proxies requests to the FastAPI screener service
"""
import os
import httpx
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter()

# FastAPI screener service URL (from docker-compose)
SCREENER_API_URL = os.getenv('SCREENER_API_URL', 'http://screener-api:8000')


@router.get("/screener")
async def get_screener(request: Request):
    """
    Proxy screener requests to FastAPI service
    """
    # Get all query parameters
    query_params = dict(request.query_params)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{SCREENER_API_URL}/api/screener",
                params=query_params
            )

            if response.status_code == 200:
                return JSONResponse(content=response.json())
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get('detail', 'Screener request failed')
                )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Screener service timeout")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Screener service unavailable: {str(e)}")


@router.get("/screener/health")
async def screener_health():
    """
    Check screener service health
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{SCREENER_API_URL}/health")

            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(status_code=503, detail="Screener service unhealthy")

    except (httpx.TimeoutException, httpx.RequestError):
        raise HTTPException(status_code=503, detail="Screener service unavailable")
