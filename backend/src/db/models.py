from sqlalchemy import create_engine, Column, String, Integer, Text, Float, Index, DateTime
from sqlalchemy.orm import sessionmaker
import os
from datetime import datetime

# Use the same Base class as the app models
try:
    from app.core.database import Base
    # Import existing Symbol model to avoid conflicts
    from app.models.symbol import Symbol
except ImportError:
    from sqlalchemy.ext.declarative import declarative_base
    Base = declarative_base()
    
    # Fallback Symbol model if app models not available
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

# Historical OHLCV price data (enhanced for ETFs, countries, asset types)
class HistoricalPrice(Base):
    __tablename__ = "historical_prices"
    
    symbol = Column(String, primary_key=True)    # e.g., AAPL (base symbol without country suffix)
    date   = Column(String, primary_key=True)    # YYYY-MM-DD
    country = Column(String, primary_key=True)   # e.g., 'us', 'uk', 'de'
    asset_type = Column(String, primary_key=True) # 'stock', 'etf', 'index', 'bond', 'commodity', 'forex'
    open   = Column(Float, nullable=False)
    high   = Column(Float, nullable=False)
    low    = Column(Float, nullable=False)
    close  = Column(Float, nullable=False)
    volume = Column(Integer, nullable=False, default=0)
    open_interest = Column(Integer, nullable=True, default=0)  # for futures/options
    source = Column(String, nullable=False)      # 'stooq' | 'schwab' | ...
    original_filename = Column(String, nullable=True)  # e.g., 'aapl.us.txt'
    folder_path = Column(String, nullable=True)  # e.g., 'daily/us/nasdaq/stocks'

# Asset metadata table for normalization
class AssetMetadata(Base):
    __tablename__ = "asset_metadata"
    
    symbol = Column(String, primary_key=True)       # e.g., AAPL
    country = Column(String, primary_key=True)      # e.g., 'us', 'uk', 'de'
    asset_type = Column(String, nullable=False)     # 'stock', 'etf', 'index', etc.
    exchange = Column(String, nullable=True)        # e.g., 'nasdaq', 'nyse', 'lse'
    name = Column(String, nullable=True)            # Full company/asset name
    sector = Column(String, nullable=True)          # Business sector
    industry = Column(String, nullable=True)        # Industry classification
    market_cap = Column(String, nullable=True)      # Market cap category
    currency = Column(String, nullable=True)        # Trading currency
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

# Tracking tables for import operations
class ImportJob(Base):
    __tablename__ = "import_jobs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime)
    status = Column(String, nullable=False, default='running')  # 'running' | 'completed' | 'failed'
    folder_path = Column(String, nullable=False)
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    total_rows = Column(Integer, default=0)
    inserted_rows = Column(Integer, default=0)
    error_count = Column(Integer, default=0)

class ImportError(Base):
    __tablename__ = "import_errors"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    import_job_id = Column(Integer, nullable=False)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    file_path = Column(String, nullable=False)
    line_number = Column(Integer)
    error_type = Column(String, nullable=False)
    error_message = Column(Text, nullable=False)

class EodScan(Base):
    __tablename__ = "eod_scans"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime)
    status = Column(String, nullable=False, default='running')  # 'running' | 'completed' | 'failed'
    scan_date = Column(String, nullable=False)  # YYYY-MM-DD
    symbols_requested = Column(Integer, default=0)
    symbols_fetched = Column(Integer, default=0)
    error_count = Column(Integer, default=0)

class EodScanError(Base):
    __tablename__ = "eod_scan_errors"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    eod_scan_id = Column(Integer, nullable=False)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    symbol = Column(String, nullable=False)
    error_type = Column(String, nullable=False)
    error_message = Column(Text, nullable=False)
    http_status = Column(Integer)

# Indexes (avoid conflicts with existing app models)
try:
    # Only create indexes if we're using the fallback Symbol model
    from app.models.symbol import Symbol as AppSymbol
    # App models already have the Symbol indexes
except ImportError:
    # Create indexes only in fallback case
    Index('symbols_exchange_idx', Symbol.listing_exchange)
    Index('symbols_etf_idx', Symbol.etf)
    Index('symbols_name_idx', Symbol.security_name)

Index("historical_prices_symbol_date_idx", HistoricalPrice.symbol, HistoricalPrice.date)
Index("import_jobs_status_idx", ImportJob.status)
Index("import_errors_job_idx", ImportError.import_job_id)
Index("eod_scans_status_idx", EodScan.status)
Index("eod_scan_errors_scan_idx", EodScanError.eod_scan_id)

# Import config from centralized location
try:
    from app.core.config import DATABASE_URL, DATA_DIR
except ImportError:
    # Fallback for when running outside of app context
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/stock_watchlist_clean.db")
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