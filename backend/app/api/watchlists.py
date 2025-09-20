from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
import logging
import csv
import io
import httpx
import asyncio
from app.core.database import get_db
from app.models.watchlist import Watchlist
from app.models.watchlist_item import WatchlistItem
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

async def trigger_market_data_refresh():
    """Trigger market data refresh from jobs service (bypassing market hours)"""
    try:
        async with httpx.AsyncClient() as client:
            # Try to call jobs-service to refresh market data
            # Use the bypass endpoint to ignore market hours restriction
            response = await client.post(
                "http://jobs-service:8004/api/jobs/market-data/run-bypass-hours",
                timeout=30.0
            )
            if response.status_code == 200:
                logger.info("Successfully triggered market data refresh after watchlist creation")
            else:
                logger.warning(f"Market data refresh trigger failed with status {response.status_code}")
    except Exception as e:
        logger.error(f"Failed to trigger market data refresh: {str(e)}")

class WatchlistItemResponse(BaseModel):
    id: int
    symbol: str
    company_name: str | None = None
    sector: str | None = None
    industry: str | None = None
    market_cap: float | None = None
    entry_price: float | None = None
    target_price: float | None = None
    stop_loss: float | None = None
    created_at: str

class WatchlistResponse(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: str
    updated_at: str | None
    items: List[WatchlistItemResponse] = []

class WatchlistCreateRequest(BaseModel):
    name: str
    description: str | None = None

@router.get("/watchlists/symbols", response_model=List[str])
def get_all_watchlist_symbols(db: Session = Depends(get_db)):
    """
    Get all unique symbols across all watchlists.
    This endpoint is used by the jobs service to know which symbols to refresh.
    """
    symbols = db.query(WatchlistItem.symbol).distinct().all()
    symbol_list = [s[0] for s in symbols if s[0]]  # Extract string from tuple, filter None
    
    logger.info(f"Retrieved {len(symbol_list)} unique symbols from all watchlists")
    return sorted(symbol_list)  # Return sorted for consistency

@router.get("/watchlists", response_model=List[WatchlistResponse])
def get_watchlists(db: Session = Depends(get_db)):
    """Get all watchlists with their items"""
    watchlists = db.query(Watchlist).all()
    result = []
    
    for watchlist in watchlists:
        items = db.query(WatchlistItem).filter(
            WatchlistItem.watchlist_id == watchlist.id
        ).all()
        
        try:
            created_at_str = ""
            if watchlist.created_at:
                if hasattr(watchlist.created_at, 'isoformat'):
                    created_at_str = watchlist.created_at.isoformat()
                else:
                    created_at_str = str(watchlist.created_at)
            
            updated_at_str = None
            if watchlist.updated_at:
                if hasattr(watchlist.updated_at, 'isoformat'):
                    updated_at_str = watchlist.updated_at.isoformat()
                else:
                    updated_at_str = str(watchlist.updated_at)
            
            # Convert items to response format
            item_responses = []
            for item in items:
                item_created_at = ""
                if item.created_at:
                    if hasattr(item.created_at, 'isoformat'):
                        item_created_at = item.created_at.isoformat()
                    else:
                        item_created_at = str(item.created_at)
                
                item_responses.append(WatchlistItemResponse(
                    id=item.id,
                    symbol=item.symbol,
                    company_name=item.company_name,
                    sector=item.sector,
                    industry=item.industry,
                    market_cap=float(item.market_cap) if item.market_cap else None,
                    entry_price=float(item.entry_price) if item.entry_price else None,
                    target_price=float(item.target_price) if item.target_price else None,
                    stop_loss=float(item.stop_loss) if item.stop_loss else None,
                    created_at=item_created_at
                ))
            
            result.append(WatchlistResponse(
                id=watchlist.id,
                name=watchlist.name,
                description=watchlist.description,
                created_at=created_at_str,
                updated_at=updated_at_str,
                items=item_responses
            ))
        except Exception as e:
            print(f"Error processing watchlist {watchlist.id}: {e}")
            continue
    
    return result

@router.get("/watchlists/{watchlist_id}", response_model=WatchlistResponse)
def get_watchlist(watchlist_id: int, db: Session = Depends(get_db)):
    """Get a specific watchlist with its items"""
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    items = db.query(WatchlistItem).filter(
        WatchlistItem.watchlist_id == watchlist_id
    ).all()
    
    # Convert items to response format
    item_responses = []
    for item in items:
        item_created_at = ""
        if item.created_at:
            if hasattr(item.created_at, 'isoformat'):
                item_created_at = item.created_at.isoformat()
            else:
                item_created_at = str(item.created_at)
        
        item_responses.append(WatchlistItemResponse(
            id=item.id,
            symbol=item.symbol,
            company_name=item.company_name,
            sector=item.sector,
            industry=item.industry,
            market_cap=float(item.market_cap) if item.market_cap else None,
            entry_price=float(item.entry_price) if item.entry_price else None,
            target_price=float(item.target_price) if item.target_price else None,
            stop_loss=float(item.stop_loss) if item.stop_loss else None,
            created_at=item_created_at
        ))
    
    return WatchlistResponse(
        id=watchlist.id,
        name=watchlist.name,
        description=watchlist.description,
        created_at=watchlist.created_at.isoformat() if watchlist.created_at else "",
        updated_at=watchlist.updated_at.isoformat() if watchlist.updated_at else None,
        items=item_responses
    )

@router.post("/watchlists", response_model=WatchlistResponse)
async def create_watchlist(request: WatchlistCreateRequest, db: Session = Depends(get_db)):
    """Create a new watchlist"""
    watchlist = Watchlist(
        name=request.name,
        description=request.description
    )
    
    db.add(watchlist)
    db.commit()
    db.refresh(watchlist)
    
    return WatchlistResponse(
        id=watchlist.id,
        name=watchlist.name,
        description=watchlist.description,
        created_at=watchlist.created_at.isoformat() if watchlist.created_at else "",
        updated_at=watchlist.updated_at.isoformat() if watchlist.updated_at else None,
        items=[]
    )

@router.put("/watchlists/{watchlist_id}", response_model=WatchlistResponse)
def update_watchlist(watchlist_id: int, request: WatchlistCreateRequest, db: Session = Depends(get_db)):
    """Update a watchlist"""
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    # Update fields
    watchlist.name = request.name
    if request.description is not None:
        watchlist.description = request.description
    
    db.commit()
    db.refresh(watchlist)
    
    # Get items
    items = db.query(WatchlistItem.symbol).filter(
        WatchlistItem.watchlist_id == watchlist_id
    ).all()
    
    return WatchlistResponse(
        id=watchlist.id,
        name=watchlist.name,
        description=watchlist.description,
        created_at=watchlist.created_at.isoformat() if watchlist.created_at else "",
        updated_at=watchlist.updated_at.isoformat() if watchlist.updated_at else None,
        items=[item.symbol for item in items]
    )

@router.delete("/watchlists/{watchlist_id}")
def delete_watchlist(watchlist_id: int, db: Session = Depends(get_db)):
    """Delete a watchlist and all its items"""
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    # Delete all items first
    db.query(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist_id).delete()
    
    # Delete the watchlist
    db.delete(watchlist)
    db.commit()
    
    return {"message": "Watchlist deleted successfully"}

@router.post("/watchlists/{watchlist_id}/items/{symbol}")
async def add_symbol_to_watchlist(watchlist_id: int, symbol: str, db: Session = Depends(get_db)):
    """Add a symbol to a watchlist"""
    # Check if watchlist exists
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    # Check if symbol is already in watchlist
    existing_item = db.query(WatchlistItem).filter(
        WatchlistItem.watchlist_id == watchlist_id,
        WatchlistItem.symbol == symbol.upper()
    ).first()
    
    if existing_item:
        raise HTTPException(status_code=400, detail="Symbol already in watchlist")
    
    # Add the symbol
    item = WatchlistItem(
        watchlist_id=watchlist_id,
        symbol=symbol.upper()
    )
    
    db.add(item)
    db.commit()

    # Trigger market data refresh for the new symbol (bypassing market hours)
    logger.info(f"Triggering market data refresh for new symbol: {symbol.upper()}")
    asyncio.create_task(trigger_market_data_refresh())

    return {"message": f"Symbol {symbol.upper()} added to watchlist"}

@router.delete("/watchlists/{watchlist_id}/items/{symbol}")
def remove_symbol_from_watchlist(watchlist_id: int, symbol: str, db: Session = Depends(get_db)):
    """Remove a symbol from a watchlist"""
    item = db.query(WatchlistItem).filter(
        WatchlistItem.watchlist_id == watchlist_id,
        WatchlistItem.symbol == symbol.upper()
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Symbol not found in watchlist")

    db.delete(item)
    db.commit()

    return {"message": f"Symbol {symbol.upper()} removed from watchlist"}

@router.post("/watchlists/upload")
async def upload_watchlist_csv(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(None),
    db: Session = Depends(get_db)
):
    """Upload a CSV file to create a new watchlist"""
    logger.info(f"Uploading watchlist CSV: {name}")

    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    try:
        # Read CSV content
        contents = file.file.read()
        csv_content = contents.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(csv_content))

        # Create the watchlist
        watchlist = Watchlist(name=name, description=description)
        db.add(watchlist)
        db.commit()
        db.refresh(watchlist)

        # Parse CSV and add symbols
        added_symbols = []
        skipped_symbols = []

        for row in csv_reader:
            # Look for symbol in common column names
            symbol = None
            for col in ['symbol', 'Symbol', 'SYMBOL', 'ticker', 'Ticker', 'TICKER']:
                if col in row and row[col]:
                    symbol = row[col].strip().upper()
                    break

            if not symbol:
                continue

            # Check if symbol already exists in this watchlist
            existing = db.query(WatchlistItem).filter(
                WatchlistItem.watchlist_id == watchlist.id,
                WatchlistItem.symbol == symbol
            ).first()

            if existing:
                skipped_symbols.append(symbol)
                continue

            # Create watchlist item
            item = WatchlistItem(
                watchlist_id=watchlist.id,
                symbol=symbol,
                company_name=row.get('company_name') or row.get('Company Name') or row.get('name'),
                sector=row.get('sector') or row.get('Sector'),
                industry=row.get('industry') or row.get('Industry'),
                market_cap=float(row['market_cap']) if row.get('market_cap') else None,
                entry_price=float(row['entry_price']) if row.get('entry_price') else None,
                target_price=float(row['target_price']) if row.get('target_price') else None,
                stop_loss=float(row['stop_loss']) if row.get('stop_loss') else None
            )

            db.add(item)
            added_symbols.append(symbol)

        db.commit()

        logger.info(f"Upload completed - Added: {len(added_symbols)}, Skipped: {len(skipped_symbols)}")

        # Get the watchlist with items for response
        items = db.query(WatchlistItem).filter(
            WatchlistItem.watchlist_id == watchlist.id
        ).all()

        # Convert items to response format
        item_responses = []
        for item in items:
            item_created_at = ""
            if item.created_at:
                if hasattr(item.created_at, 'isoformat'):
                    item_created_at = item.created_at.isoformat()
                else:
                    item_created_at = str(item.created_at)

            item_responses.append(WatchlistItemResponse(
                id=item.id,
                symbol=item.symbol,
                company_name=item.company_name,
                sector=item.sector,
                industry=item.industry,
                market_cap=float(item.market_cap) if item.market_cap else None,
                entry_price=float(item.entry_price) if item.entry_price else None,
                target_price=float(item.target_price) if item.target_price else None,
                stop_loss=float(item.stop_loss) if item.stop_loss else None,
                created_at=item_created_at
            ))

        watchlist_response = WatchlistResponse(
            id=watchlist.id,
            name=watchlist.name,
            description=watchlist.description,
            created_at=watchlist.created_at.isoformat() if watchlist.created_at else "",
            updated_at=watchlist.updated_at.isoformat() if watchlist.updated_at else None,
            items=item_responses
        )

        # Trigger market data refresh for new symbols (bypassing market hours)
        if added_symbols:
            logger.info(f"Triggering market data refresh for {len(added_symbols)} new symbols")
            # Run in background to not block the response
            asyncio.create_task(trigger_market_data_refresh())

        return {
            "watchlist": watchlist_response,
            "valid_symbols": added_symbols,
            "invalid_symbols": skipped_symbols,  # Using skipped as invalid for now
            "total_processed": len(added_symbols) + len(skipped_symbols)
        }

    except Exception as e:
        logger.error(f"Error uploading CSV: {str(e)}")
        # Clean up if watchlist was created but items failed
        if 'watchlist' in locals():
            db.delete(watchlist)
            db.commit()
        raise HTTPException(status_code=500, detail=f"Error processing CSV file: {str(e)}")
    finally:
        file.file.close()

