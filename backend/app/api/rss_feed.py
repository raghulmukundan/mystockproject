from fastapi import APIRouter, HTTPException
import httpx
import logging

router = APIRouter(prefix="/rss", tags=["rss"])
logger = logging.getLogger(__name__)

@router.get("/yahoo/{symbol}")
async def yahoo_finance_feed(symbol: str):
    """Simple proxy for Yahoo Finance RSS feed."""
    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol.upper()}&region=US&lang=en-US"
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                return {"error": f"Failed to fetch feed: {response.status_code}"}
            
            return {"xml": response.text}
            
    except Exception as e:
        logger.error(f"Error fetching Yahoo feed: {str(e)}")
        return {"error": str(e)}

@router.get("/seeking-alpha/{symbol}")
async def seeking_alpha_feed(symbol: str):
    """Simple proxy for Seeking Alpha RSS feed."""
    url = f"https://seekingalpha.com/api/sa/combined/{symbol.upper()}.xml"
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                return {"error": f"Failed to fetch feed: {response.status_code}"}
            
            return {"xml": response.text}
            
    except Exception as e:
        logger.error(f"Error fetching Seeking Alpha feed: {str(e)}")
        return {"error": str(e)}