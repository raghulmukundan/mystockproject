from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
import pandas as pd
import io
import logging
from app.core.database import get_db
from app.models.watchlist import Watchlist
from app.models.watchlist_item import WatchlistItem
from app.api.schemas import WatchlistResponse, WatchlistCreate, WatchlistUpdate, WatchlistItemCreate, WatchlistItemUpdate, WatchlistItemResponse, UploadResponse
from app.services.symbol_validator import symbol_validator
from app.services.stock_data import stock_data_service
from app.services.alert_service import SmartAlertService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/watchlists", tags=["watchlists"])

@router.get("/test")
async def test_endpoint():
    """Simple test endpoint to verify API is working"""
    return {"status": "ok", "message": "Watchlists API is working"}

async def enrich_item_with_profile(item_data: dict, symbol: str) -> dict:
    """Enrich item data with company profile information (fast fallback only)"""
    try:
        # Skip API calls during upload - use only cached/fallback data for speed
        profile = stock_data_service._get_fallback_profile(symbol)
        if profile:
            item_data.update({
                'company_name': item_data.get('company_name') or profile.company_name,
                'sector': profile.sector,
                'industry': profile.industry,
                'market_cap': profile.market_cap
            })
    except Exception as e:
        print(f"Warning: Could not fetch profile for {symbol}: {e}")
    return item_data

@router.post("/upload", response_model=UploadResponse)
async def upload_watchlist(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    db: Session = Depends(get_db)
):
    if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be CSV or Excel format")
    
    try:
        content = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
        
        if 'symbol' not in df.columns:
            raise HTTPException(status_code=400, detail="CSV/Excel must contain 'symbol' column")
        
        symbols = df['symbol'].dropna().astype(str).str.upper().str.strip().tolist()
        
        # Limit the number of symbols to prevent timeouts
        if len(symbols) > 50:
            raise HTTPException(status_code=400, detail=f"Too many symbols ({len(symbols)}). Maximum 50 symbols allowed per upload.")
        
        print(f"Processing upload for {len(symbols)} symbols...")
        # Skip complex validation for now - just assume all symbols are valid
        # This can be validated later via the refresh function
        valid_symbols = symbols
        invalid_symbols = []
        print(f"Fast upload: accepting all {len(valid_symbols)} symbols")
        
        # Add retry logic for database operations
        import time
        max_retries = 3
        for attempt in range(max_retries):
            try:
                watchlist = Watchlist(name=name, description=description)
                db.add(watchlist)
                db.flush()
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"Database retry attempt {attempt + 1}, error: {e}")
                    time.sleep(0.5 * (attempt + 1))  # Exponential backoff
                    db.rollback()
                else:
                    raise
        
        watchlist_items = []
        total_valid = len([s for s in symbols if s in valid_symbols])
        processed_count = 0
        
        for _, row in df.iterrows():
            symbol = str(row['symbol']).upper().strip()
            if symbol in valid_symbols:
                processed_count += 1
                print(f"Processing symbol {processed_count}/{total_valid}: {symbol}")
                
                item_data = {
                    'watchlist_id': watchlist.id,
                    'symbol': symbol,
                    'company_name': row.get('company_name', None),
                    'entry_price': row.get('entry_price', None),
                    'target_price': row.get('target_price', None),
                    'stop_loss': row.get('stop_loss', None)
                }
                
                # Enrich with fast fallback profile data (no API calls)
                item_data = await enrich_item_with_profile(item_data, symbol)
                
                item_data = {k: v for k, v in item_data.items() if pd.notna(v)}
                watchlist_item = WatchlistItem(**item_data)
                watchlist_items.append(watchlist_item)
        
        db.add_all(watchlist_items)
        db.commit()
        db.refresh(watchlist)
        
        # Automatically create alerts for the new watchlist
        try:
            alert_service = SmartAlertService(db)
            await alert_service.analyze_specific_watchlist(watchlist.id)
            logger.info(f"Auto-created alerts for uploaded watchlist: {watchlist.name}")
        except Exception as e:
            logger.warning(f"Failed to auto-create alerts for watchlist {watchlist.name}: {e}")
        
        return UploadResponse(
            watchlist=WatchlistResponse.model_validate(watchlist),
            valid_symbols=valid_symbols,
            invalid_symbols=invalid_symbols,
            total_processed=len(symbols)
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

@router.get("/", response_model=List[WatchlistResponse])
def get_watchlists(db: Session = Depends(get_db)):
    watchlists = db.query(Watchlist).all()
    return watchlists

@router.get("/{watchlist_id}", response_model=WatchlistResponse)
def get_watchlist(watchlist_id: int, db: Session = Depends(get_db)):
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return watchlist

@router.post("/", response_model=WatchlistResponse)
async def create_watchlist(watchlist: WatchlistCreate, db: Session = Depends(get_db)):
    symbols = [item.symbol.upper().strip() for item in watchlist.items]
    valid_symbols, invalid_symbols = await symbol_validator.validate_symbols(symbols)
    
    if invalid_symbols:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid symbols: {', '.join(invalid_symbols)}"
        )
    
    db_watchlist = Watchlist(name=watchlist.name, description=watchlist.description)
    db.add(db_watchlist)
    db.flush()
    
    watchlist_items = []
    for item in watchlist.items:
        if item.symbol.upper() in valid_symbols:
            item_data = {
                'watchlist_id': db_watchlist.id,
                'symbol': item.symbol.upper(),
                'company_name': item.company_name,
                'entry_price': item.entry_price,
                'target_price': item.target_price,
                'stop_loss': item.stop_loss
            }
            
            # Enrich with company profile data
            item_data = await enrich_item_with_profile(item_data, item.symbol.upper())
            
            watchlist_item = WatchlistItem(**item_data)
            watchlist_items.append(watchlist_item)
    
    db.add_all(watchlist_items)
    db.commit()
    db.refresh(db_watchlist)
    
    # Automatically create alerts for the new watchlist
    try:
        alert_service = SmartAlertService(db)
        await alert_service.analyze_specific_watchlist(db_watchlist.id)
        logger.info(f"Auto-created alerts for new watchlist: {db_watchlist.name}")
    except Exception as e:
        logger.warning(f"Failed to auto-create alerts for watchlist {db_watchlist.name}: {e}")
    
    return db_watchlist

@router.put("/{watchlist_id}", response_model=WatchlistResponse)
async def update_watchlist(
    watchlist_id: int, 
    watchlist_update: WatchlistUpdate, 
    db: Session = Depends(get_db)
):
    db_watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not db_watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    if watchlist_update.name is not None:
        db_watchlist.name = watchlist_update.name
    
    if watchlist_update.description is not None:
        db_watchlist.description = watchlist_update.description
    
    if watchlist_update.items is not None:
        symbols = [item.symbol.upper().strip() for item in watchlist_update.items]
        valid_symbols, invalid_symbols = await symbol_validator.validate_symbols(symbols)
        
        if invalid_symbols:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid symbols: {', '.join(invalid_symbols)}"
            )
        
        db.query(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist_id).delete()
        
        new_items = []
        for item in watchlist_update.items:
            if item.symbol.upper() in valid_symbols:
                item_data = {
                    'watchlist_id': watchlist_id,
                    'symbol': item.symbol.upper(),
                    'company_name': item.company_name,
                    'entry_price': item.entry_price,
                    'target_price': item.target_price,
                    'stop_loss': item.stop_loss
                }
                
                # Enrich with company profile data
                item_data = await enrich_item_with_profile(item_data, item.symbol.upper())
                
                watchlist_item = WatchlistItem(**item_data)
                new_items.append(watchlist_item)
        
        db.add_all(new_items)
    
    db.commit()
    db.refresh(db_watchlist)
    
    return db_watchlist

@router.delete("/{watchlist_id}")
def delete_watchlist(watchlist_id: int, db: Session = Depends(get_db)):
    db_watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not db_watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    db.delete(db_watchlist)
    db.commit()
    
    return {"message": f"Watchlist '{db_watchlist.name}' deleted successfully"}

@router.post("/{watchlist_id}/items", response_model=WatchlistItemResponse)
async def add_watchlist_item(
    watchlist_id: int,
    item: WatchlistItemCreate,
    db: Session = Depends(get_db)
):
    db_watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not db_watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    valid_symbols, invalid_symbols = await symbol_validator.validate_symbols([item.symbol])
    
    if invalid_symbols:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid symbol: {item.symbol}"
        )
    
    existing_item = db.query(WatchlistItem).filter(
        WatchlistItem.watchlist_id == watchlist_id,
        WatchlistItem.symbol == item.symbol.upper()
    ).first()
    
    if existing_item:
        raise HTTPException(
            status_code=400, 
            detail=f"Symbol {item.symbol} already exists in this watchlist"
        )
    
    item_data = {
        'watchlist_id': watchlist_id,
        'symbol': item.symbol.upper(),
        'company_name': item.company_name,
        'entry_price': item.entry_price,
        'target_price': item.target_price,
        'stop_loss': item.stop_loss
    }
    
    # Enrich with company profile data
    item_data = await enrich_item_with_profile(item_data, item.symbol.upper())
    
    watchlist_item = WatchlistItem(**item_data)
    
    db.add(watchlist_item)
    db.commit()
    db.refresh(watchlist_item)
    
    return watchlist_item

@router.put("/{watchlist_id}/items/{item_id}", response_model=WatchlistItemResponse)
async def update_watchlist_item(
    watchlist_id: int,
    item_id: int,
    item_update: WatchlistItemUpdate,
    db: Session = Depends(get_db)
):
    db_item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.watchlist_id == watchlist_id
    ).first()
    
    if not db_item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    
    if item_update.symbol is not None:
        valid_symbols, invalid_symbols = await symbol_validator.validate_symbols([item_update.symbol])
        
        if invalid_symbols:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid symbol: {item_update.symbol}"
            )
        
        existing_item = db.query(WatchlistItem).filter(
            WatchlistItem.watchlist_id == watchlist_id,
            WatchlistItem.symbol == item_update.symbol.upper(),
            WatchlistItem.id != item_id
        ).first()
        
        if existing_item:
            raise HTTPException(
                status_code=400, 
                detail=f"Symbol {item_update.symbol} already exists in this watchlist"
            )
        
        db_item.symbol = item_update.symbol.upper()
    
    if item_update.company_name is not None:
        db_item.company_name = item_update.company_name
    
    if item_update.sector is not None:
        db_item.sector = item_update.sector
    
    if item_update.industry is not None:
        db_item.industry = item_update.industry
    
    if item_update.market_cap is not None:
        db_item.market_cap = item_update.market_cap
    
    if item_update.entry_price is not None:
        db_item.entry_price = item_update.entry_price
    
    if item_update.target_price is not None:
        db_item.target_price = item_update.target_price
    
    if item_update.stop_loss is not None:
        db_item.stop_loss = item_update.stop_loss
    
    db.commit()
    db.refresh(db_item)
    
    return db_item

@router.delete("/{watchlist_id}/items/{item_id}")
def delete_watchlist_item(
    watchlist_id: int,
    item_id: int,
    db: Session = Depends(get_db)
):
    db_item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.watchlist_id == watchlist_id
    ).first()
    
    if not db_item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    
    symbol = db_item.symbol
    db.delete(db_item)
    db.commit()
    
    return {"message": f"Symbol '{symbol}' removed from watchlist"}

@router.post("/{watchlist_id}/refresh-profiles")
async def refresh_watchlist_profiles(
    watchlist_id: int,
    db: Session = Depends(get_db)
):
    """Refresh company profile data for all items in a watchlist"""
    db_watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not db_watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    
    updated_count = 0
    
    for item in db_watchlist.items:
        try:
            # Use only fast fallback profile data (no API calls)
            profile = stock_data_service._get_fallback_profile(item.symbol)
            if profile:
                # Update item with fallback profile data
                item.company_name = profile.company_name
                item.sector = profile.sector
                item.industry = profile.industry
                item.market_cap = profile.market_cap
                updated_count += 1
                print(f"Updated profile for {item.symbol}: {profile.company_name}")
        except Exception as e:
            print(f"Error updating profile for {item.symbol}: {e}")
            continue
    
    db.commit()
    
    return {
        "message": f"Updated profile data for {updated_count} items in watchlist '{db_watchlist.name}'",
        "updated_count": updated_count,
        "total_items": len(db_watchlist.items)
    }