from sqlalchemy import create_engine, Column, String, Integer, Text, Float, Index
from sqlalchemy.orm import sessionmaker
import os

# Use the same Base class as the app models
try:
    from app.core.database import Base
except ImportError:
    from sqlalchemy.ext.declarative import declarative_base
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
class PriceDaily(Base):
    __tablename__ = "prices_daily"
    
    symbol = Column(String, primary_key=True)   # e.g., AAPL
    date   = Column(String, primary_key=True)   # YYYY-MM-DD
    open   = Column(Float,  nullable=False)
    high   = Column(Float,  nullable=False)
    low    = Column(Float,  nullable=False)
    close  = Column(Float,  nullable=False)
    volume = Column(Integer, nullable=False, default=0)
    source = Column(String,  nullable=False, default="schwab")  # provenance

# Indexes
Index('symbols_exchange_idx', Symbol.listing_exchange)
Index('symbols_etf_idx', Symbol.etf)
Index('symbols_name_idx', Symbol.security_name)
Index("prices_daily_symbol_date_idx", PriceDaily.symbol, PriceDaily.date)

# Import config from centralized location
try:
    from app.core.config import DATABASE_URL, DATA_DIR
except ImportError:
    # Fallback for when running outside of app context
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/stock_watchlist.db")
    DATA_DIR = os.getenv("DATA_DIR", "./data")

# Create data directory if it doesn't exist
os.makedirs(DATA_DIR, exist_ok=True)

# SQLite configuration with WAL mode and pragmas
engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    },
    pool_pre_ping=True,
    echo=False
)

def configure_sqlite_pragmas(connection, connection_record):
    """Configure SQLite pragmas for better performance and concurrency"""
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL") 
    connection.execute("PRAGMA foreign_keys=ON")

from sqlalchemy import event
event.listen(engine, "connect", configure_sqlite_pragmas)

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