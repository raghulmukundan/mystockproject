from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
import pandas as pd
import io
from app.core.database import get_db
from app.models.watchlist import Watchlist
from app.models.watchlist_item import WatchlistItem
from app.api.schemas import WatchlistResponse, WatchlistCreate, UploadResponse
from app.services.symbol_validator import symbol_validator

router = APIRouter(prefix="/watchlists", tags=["watchlists"])

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
        
        valid_symbols, invalid_symbols = await symbol_validator.validate_symbols(symbols)
        
        watchlist = Watchlist(name=name, description=description)
        db.add(watchlist)
        db.flush()
        
        watchlist_items = []
        for _, row in df.iterrows():
            symbol = str(row['symbol']).upper().strip()
            if symbol in valid_symbols:
                item_data = {
                    'watchlist_id': watchlist.id,
                    'symbol': symbol,
                    'company_name': row.get('company_name', None),
                    'entry_price': row.get('entry_price', None),
                    'target_price': row.get('target_price', None),
                    'stop_loss': row.get('stop_loss', None)
                }
                
                item_data = {k: v for k, v in item_data.items() if pd.notna(v)}
                watchlist_item = WatchlistItem(**item_data)
                watchlist_items.append(watchlist_item)
        
        db.add_all(watchlist_items)
        db.commit()
        db.refresh(watchlist)
        
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
            watchlist_item = WatchlistItem(
                watchlist_id=db_watchlist.id,
                symbol=item.symbol.upper(),
                company_name=item.company_name,
                entry_price=item.entry_price,
                target_price=item.target_price,
                stop_loss=item.stop_loss
            )
            watchlist_items.append(watchlist_item)
    
    db.add_all(watchlist_items)
    db.commit()
    db.refresh(db_watchlist)
    
    return db_watchlist