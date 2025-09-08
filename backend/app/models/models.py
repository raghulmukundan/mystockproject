from sqlalchemy import create_engine, Column, String, Integer, Text, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .core.config import DATABASE_URL, DATA_DIR
import os

Base = declarative_base()

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

# Create data directory if it doesn't exist
os.makedirs(DATA_DIR, exist_ok=True)

# PostgreSQL configuration
engine = create_engine(
    DATABASE_URL,
    pool_size=20,                    # Connection pool size
    max_overflow=30,                 # Max overflow connections
    pool_pre_ping=True,              # Verify connections before use
    pool_recycle=3600,               # Recycle connections every hour
    echo=False,                      # Set to True for SQL debugging
    connect_args={
        "application_name": "stock_watchlist_api",
        "options": "-c timezone=UTC"
    }
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """Database dependency for FastAPI"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database tables and indexes"""
    Base.metadata.create_all(bind=engine)