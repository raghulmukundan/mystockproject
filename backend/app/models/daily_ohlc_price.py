from sqlalchemy import Column, String, Float, Integer, Index
from app.core.database import Base

class DailyOHLCPrice(Base):
    __tablename__ = "prices_daily_ohlc"

    symbol = Column(String, primary_key=True)   # e.g., AAPL
    date   = Column(String, primary_key=True)   # YYYY-MM-DD
    open   = Column(Float,  nullable=False)
    high   = Column(Float,  nullable=False)
    low    = Column(Float,  nullable=False)
    close  = Column(Float,  nullable=False)
    volume = Column(Integer, nullable=False, default=0)
    source = Column(String,  nullable=False, default="schwab")  # provenance

# Index for fast lookups
Index("prices_daily_ohlc_symbol_date_idx", DailyOHLCPrice.symbol, DailyOHLCPrice.date)