from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.watchlist import Watchlist
from app.models.watchlist_item import WatchlistItem
from pydantic import BaseModel

router = APIRouter()

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
def create_watchlist(request: WatchlistCreateRequest, db: Session = Depends(get_db)):
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
def add_symbol_to_watchlist(watchlist_id: int, symbol: str, db: Session = Depends(get_db)):
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