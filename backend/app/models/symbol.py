from sqlalchemy import Column, String, Integer, Text, Index
from app.core.database import Base

class Symbol(Base):
    __tablename__ = 'symbols'
    
    symbol = Column(String, primary_key=True)
    security_name = Column(Text, nullable=False)
    listing_exchange = Column(Text)
    market_category = Column(Text)
    test_issue = Column(Text)  # 'Y' or 'N'
    financial_status = Column(Text)
    round_lot_size = Column(Integer)
    etf = Column(Text)  # 'Y' or 'N'
    nextshares = Column(Text)  # 'Y' or 'N' (may be blank)
    stooq_symbol = Column(Text, nullable=False)  # derived: aapl.us, brk-b.us
    updated_at = Column(Text, nullable=False)  # ISO8601 UTC

# Indexes
Index('symbols_exchange_idx', Symbol.listing_exchange)
Index('symbols_etf_idx', Symbol.etf)
Index('symbols_name_idx', Symbol.security_name)