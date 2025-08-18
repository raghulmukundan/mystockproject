from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

class WatchlistItemCreate(BaseModel):
    symbol: str
    company_name: Optional[str] = None
    entry_price: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    stop_loss: Optional[Decimal] = None

class WatchlistItemResponse(BaseModel):
    id: int
    symbol: str
    company_name: Optional[str]
    entry_price: Optional[Decimal]
    target_price: Optional[Decimal]
    stop_loss: Optional[Decimal]
    created_at: datetime

    class Config:
        from_attributes = True

class WatchlistCreate(BaseModel):
    name: str
    description: Optional[str] = None
    items: List[WatchlistItemCreate] = []

class WatchlistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    items: Optional[List[WatchlistItemCreate]] = None

class WatchlistItemUpdate(BaseModel):
    symbol: Optional[str] = None
    company_name: Optional[str] = None
    entry_price: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    stop_loss: Optional[Decimal] = None

class WatchlistResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    items: List[WatchlistItemResponse] = []

    class Config:
        from_attributes = True

class UploadResponse(BaseModel):
    watchlist: WatchlistResponse
    valid_symbols: List[str]
    invalid_symbols: List[str]
    total_processed: int