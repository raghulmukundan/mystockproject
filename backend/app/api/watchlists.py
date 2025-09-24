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
    symbols: List[str] | None = None

class WatchlistItemRequest(BaseModel):
    symbol: str
    company_name: str | None = None
    sector: str | None = None
    industry: str | None = None
    market_cap: float | None = None
    entry_price: float | None = None
    target_price: float | None = None
    stop_loss: float | None = None

class WatchlistUpdateRequest(BaseModel):
    name: str
    description: str | None = None
    items: List[WatchlistItemRequest] | None = None

async def fetch_and_store_prices_for_symbols(symbols: List[str]):
    """Fetch prices from Finnhub and store in prices_realtime_cache table using new endpoint"""
    try:
        async with httpx.AsyncClient() as client:
            payload = {"symbols": symbols}
            response = await client.post(
                "http://backend:8002/api/prices/fetch-and-store",
                json=payload,
                timeout=60.0
            )
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Successfully fetched and stored prices for {len(result.get('symbols_processed', []))} symbols")
                if result.get('symbols_failed'):
                    logger.warning(f"Failed to fetch prices for symbols: {result['symbols_failed']}")
            else:
                logger.warning(f"Failed to fetch and store prices: {response.status_code}")
    except Exception as e:
        logger.error(f"Failed to fetch and store prices for symbols {symbols}: {str(e)}")

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
    """Create a new watchlist with optional symbols"""
    watchlist = Watchlist(
        name=request.name,
        description=request.description
    )

    db.add(watchlist)
    db.commit()
    db.refresh(watchlist)

    # Add symbols if provided
    items = []
    if request.symbols:
        new_symbols = []
        for symbol in request.symbols:
            symbol = symbol.upper().strip()
            if symbol:
                # Check if symbol already exists in this watchlist
                existing_item = db.query(WatchlistItem).filter(
                    WatchlistItem.watchlist_id == watchlist.id,
                    WatchlistItem.symbol == symbol
                ).first()

                if not existing_item:
                    item = WatchlistItem(
                        watchlist_id=watchlist.id,
                        symbol=symbol
                    )
                    db.add(item)
                    new_symbols.append(symbol)

        if new_symbols:
            db.commit()

            # Fetch and store prices for new symbols
            logger.info(f"Fetching and storing prices for {len(new_symbols)} symbols in new watchlist")
            asyncio.create_task(fetch_and_store_prices_for_symbols(new_symbols))

            # Get the created items for response
            items_query = db.query(WatchlistItem).filter(
                WatchlistItem.watchlist_id == watchlist.id
            ).all()

            for item in items_query:
                item_created_at = ""
                if item.created_at:
                    if hasattr(item.created_at, 'isoformat'):
                        item_created_at = item.created_at.isoformat()
                    else:
                        item_created_at = str(item.created_at)

                items.append(WatchlistItemResponse(
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
        items=items
    )

@router.put("/watchlists/{watchlist_id}", response_model=WatchlistResponse)
async def update_watchlist(watchlist_id: int, request: WatchlistUpdateRequest, db: Session = Depends(get_db)):
    """Update a watchlist and its items"""
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    # Update watchlist fields
    watchlist.name = request.name
    if request.description is not None:
        watchlist.description = request.description

    # Update items if provided
    if request.items is not None:
        # Delete existing items
        db.query(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist_id).delete()

        # Add new items
        new_symbols = []
        for item_data in request.items:
            item = WatchlistItem(
                watchlist_id=watchlist_id,
                symbol=item_data.symbol.upper(),
                company_name=item_data.company_name,
                sector=item_data.sector,
                industry=item_data.industry,
                market_cap=item_data.market_cap,
                entry_price=item_data.entry_price,
                target_price=item_data.target_price,
                stop_loss=item_data.stop_loss
            )
            db.add(item)
            new_symbols.append(item_data.symbol.upper())

    db.commit()
    db.refresh(watchlist)

    # Get updated items for response
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

    # Fetch and store prices for new symbols if items were updated
    if request.items is not None and new_symbols:
        logger.info(f"Fetching and storing prices for updated watchlist with {len(new_symbols)} symbols")
        asyncio.create_task(fetch_and_store_prices_for_symbols(new_symbols))

    return WatchlistResponse(
        id=watchlist.id,
        name=watchlist.name,
        description=watchlist.description,
        created_at=watchlist.created_at.isoformat() if watchlist.created_at else "",
        updated_at=watchlist.updated_at.isoformat() if watchlist.updated_at else None,
        items=item_responses
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

    # Fetch and store price for the newly added symbol
    logger.info(f"Fetching and storing price for newly added symbol: {symbol.upper()}")
    asyncio.create_task(fetch_and_store_prices_for_symbols([symbol.upper()]))

    return {"message": f"Symbol {symbol.upper()} added to watchlist"}

@router.delete("/watchlists/{watchlist_id}/symbols/{symbol}")
def remove_symbol_from_watchlist(watchlist_id: int, symbol: str, db: Session = Depends(get_db)):
    """Remove a symbol from a watchlist (legacy endpoint)"""
    item = db.query(WatchlistItem).filter(
        WatchlistItem.watchlist_id == watchlist_id,
        WatchlistItem.symbol == symbol.upper()
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Symbol not found in watchlist")

    db.delete(item)
    db.commit()

    return {"message": f"Symbol {symbol.upper()} removed from watchlist"}

@router.post("/watchlists/{watchlist_id}/items", response_model=WatchlistItemResponse)
async def add_item_to_watchlist(watchlist_id: int, item: WatchlistItemRequest, db: Session = Depends(get_db)):
    """Add an item to a watchlist (standard REST endpoint)"""
    logger.info(f"Adding item to watchlist {watchlist_id}: {item}")

    # Check if watchlist exists
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    # Check if symbol already exists in this watchlist
    existing_item = db.query(WatchlistItem).filter(
        WatchlistItem.watchlist_id == watchlist_id,
        WatchlistItem.symbol == item.symbol.upper()
    ).first()

    if existing_item:
        raise HTTPException(status_code=400, detail=f"Symbol {item.symbol.upper()} already exists in this watchlist")

    # Validate symbol exists by trying to fetch it from Finnhub
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Call external APIs service to validate the symbol
            response = await client.get(
                f"http://external-apis:8003/finnhub/quotes",
                params={"symbols": item.symbol.upper()}
            )

            if response.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Invalid symbol: {item.symbol.upper()}")

            symbol_data = response.json()
            if not symbol_data or item.symbol.upper() not in symbol_data:
                raise HTTPException(status_code=400, detail=f"Invalid symbol: {item.symbol.upper()}")

            # Check if the price data indicates a valid symbol (non-zero price)
            price_info = symbol_data.get(item.symbol.upper(), {})
            if not price_info or price_info.get('current_price', 0) <= 0:
                raise HTTPException(status_code=400, detail=f"Invalid symbol: {item.symbol.upper()}")

    except httpx.RequestError:
        logger.warning(f"Could not validate symbol {item.symbol.upper()} - external service unavailable")
        # Continue without validation if external service is down
    except HTTPException:
        raise  # Re-raise validation errors
    except Exception as e:
        logger.error(f"Error validating symbol {item.symbol.upper()}: {str(e)}")
        # Continue without validation on unexpected errors

    # Create new watchlist item
    new_item = WatchlistItem(
        watchlist_id=watchlist_id,
        symbol=item.symbol.upper(),
        company_name=item.company_name,
        sector=item.sector,
        industry=item.industry,
        market_cap=item.market_cap,
        entry_price=item.entry_price,
        target_price=item.target_price,
        stop_loss=item.stop_loss
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return WatchlistItemResponse(
        id=new_item.id,
        symbol=new_item.symbol,
        company_name=new_item.company_name,
        sector=new_item.sector,
        industry=new_item.industry,
        market_cap=new_item.market_cap,
        entry_price=new_item.entry_price,
        target_price=new_item.target_price,
        stop_loss=new_item.stop_loss,
        created_at=new_item.created_at.isoformat()
    )

@router.put("/watchlists/{watchlist_id}/items/{item_id}", response_model=WatchlistItemResponse)
async def update_watchlist_item(watchlist_id: int, item_id: int, item: WatchlistItemRequest, db: Session = Depends(get_db)):
    """Update a watchlist item (standard REST endpoint)"""
    # Check if watchlist exists
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    # Check if item exists
    existing_item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.watchlist_id == watchlist_id
    ).first()

    if not existing_item:
        raise HTTPException(status_code=404, detail="Item not found in this watchlist")

    # Update the item
    existing_item.symbol = item.symbol.upper()
    existing_item.company_name = item.company_name
    existing_item.sector = item.sector
    existing_item.industry = item.industry
    existing_item.market_cap = item.market_cap
    existing_item.entry_price = item.entry_price
    existing_item.target_price = item.target_price
    existing_item.stop_loss = item.stop_loss

    db.commit()
    db.refresh(existing_item)

    return WatchlistItemResponse(
        id=existing_item.id,
        symbol=existing_item.symbol,
        company_name=existing_item.company_name,
        sector=existing_item.sector,
        industry=existing_item.industry,
        market_cap=existing_item.market_cap,
        entry_price=existing_item.entry_price,
        target_price=existing_item.target_price,
        stop_loss=existing_item.stop_loss,
        created_at=existing_item.created_at.isoformat()
    )

@router.delete("/watchlists/{watchlist_id}/items/{item_id}")
async def delete_watchlist_item(watchlist_id: int, item_id: int, db: Session = Depends(get_db)):
    """Delete a watchlist item (standard REST endpoint)"""
    # Check if watchlist exists
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    # Check if item exists
    existing_item = db.query(WatchlistItem).filter(
        WatchlistItem.id == item_id,
        WatchlistItem.watchlist_id == watchlist_id
    ).first()

    if not existing_item:
        raise HTTPException(status_code=404, detail="Item not found in this watchlist")

    db.delete(existing_item)
    db.commit()

    return {"message": f"Item {existing_item.symbol} deleted from watchlist"}

@router.get("/watchlists/{watchlist_id}/prices")
async def get_watchlist_prices(watchlist_id: int, db: Session = Depends(get_db)):
    """Get current prices for all symbols in a watchlist from prices_realtime_cache table"""
    try:
        # Check if watchlist exists
        watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
        if not watchlist:
            raise HTTPException(status_code=404, detail="Watchlist not found")

        # Get all symbols in the watchlist
        items = db.query(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist_id).all()
        symbols = [item.symbol for item in items]

        if not symbols:
            return {"watchlist_id": watchlist_id, "prices": []}

        # Use the new backend prices endpoint to get prices from database
        async with httpx.AsyncClient() as client:
            payload = {"symbols": symbols}
            response = await client.post(
                "http://backend:8000/api/prices/get-from-db",
                json=payload,
                timeout=30.0
            )
            if response.status_code == 200:
                prices = response.json()
                logger.info(f"Retrieved prices for {len(prices)} symbols in watchlist {watchlist_id}")
                return {"watchlist_id": watchlist_id, "prices": prices}
            else:
                logger.warning(f"Failed to fetch prices from database: {response.status_code}")
                return {"watchlist_id": watchlist_id, "prices": []}

    except Exception as e:
        logger.error(f"Error getting watchlist prices: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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

        # Fetch and store prices for new symbols
        if added_symbols:
            logger.info(f"Fetching and storing prices for {len(added_symbols)} new symbols")
            # Run in background to not block the response
            asyncio.create_task(fetch_and_store_prices_for_symbols(added_symbols))

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

@router.post("/watchlists/{watchlist_id}/refresh-profiles")
async def refresh_watchlist_profiles(watchlist_id: int, db: Session = Depends(get_db)):
    """Refresh profiles for all symbols in a watchlist"""
    # Check if watchlist exists
    watchlist = db.query(Watchlist).filter(Watchlist.id == watchlist_id).first()
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    # Get all items in the watchlist
    items = db.query(WatchlistItem).filter(WatchlistItem.watchlist_id == watchlist_id).all()

    if not items:
        return {
            "message": "No symbols to refresh",
            "updated_count": 0,
            "total_items": 0
        }

    # Fetch and store latest prices for all symbols in the watchlist
    symbols = [item.symbol for item in items]
    logger.info(f"Refreshing prices for {len(items)} items in watchlist {watchlist_id}")
    asyncio.create_task(fetch_and_store_prices_for_symbols(symbols))

    return {
        "message": f"Profile refresh triggered for {len(items)} symbols",
        "updated_count": len(items),
        "total_items": len(items)
    }

