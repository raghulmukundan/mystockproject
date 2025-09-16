from sqlalchemy import create_engine, Column, String, Integer, BigInteger, Text, Float, Index, DateTime, Boolean
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
    volume = Column(BigInteger, nullable=False, default=0)
    open_interest = Column(BigInteger, nullable=True, default=0)  # for futures/options
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
    total_files = Column(BigInteger, default=0)
    processed_files = Column(BigInteger, default=0)
    total_rows = Column(BigInteger, default=0)
    inserted_rows = Column(BigInteger, default=0)
    error_count = Column(BigInteger, default=0)
    current_file = Column(String, nullable=True)  # Currently processing file
    current_folder = Column(String, nullable=True)  # Currently processing folder

class ImportError(Base):
    __tablename__ = "import_errors"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    import_job_id = Column(Integer, nullable=False)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    file_path = Column(String, nullable=False)
    line_number = Column(Integer)
    error_type = Column(String, nullable=False)
    error_message = Column(Text, nullable=False)

class ProcessedFile(Base):
    __tablename__ = "processed_files"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    import_job_id = Column(Integer, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False)
    file_modified_time = Column(DateTime, nullable=False)
    rows_processed = Column(Integer, nullable=False, default=0)
    rows_inserted = Column(Integer, nullable=False, default=0)
    rows_updated = Column(Integer, nullable=False, default=0)
    processing_start = Column(DateTime, nullable=False, default=datetime.utcnow)
    processing_end = Column(DateTime, nullable=True)
    checksum = Column(String, nullable=True)  # Optional file hash for integrity
    status = Column(String, nullable=False, default='processing')  # processing, completed, failed

class FailedFile(Base):
    __tablename__ = "failed_files"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    import_job_id = Column(Integer, nullable=False)
    file_path = Column(String, nullable=False)
    error_type = Column(String, nullable=False)  # 'session_concurrency', 'parse_error', etc.
    error_message = Column(Text, nullable=False)
    failed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    retry_count = Column(Integer, nullable=False, default=0)
    last_retry_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default='pending')  # 'pending', 'retrying', 'completed', 'permanent_failure'

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

class JobConfiguration(Base):
    __tablename__ = "job_configurations"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String, nullable=False, unique=True)  # 'market_data_refresh', 'nasdaq_universe_refresh', 'eod_price_scan'
    description = Column(String, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True)
    schedule_type = Column(String, nullable=False)  # 'interval', 'cron'
    
    # Interval scheduling (for every X minutes/hours)
    interval_value = Column(Integer, nullable=True)  # e.g., 30
    interval_unit = Column(String, nullable=True)   # 'minutes', 'hours'
    
    # Cron scheduling (for specific times)
    cron_day_of_week = Column(String, nullable=True)  # 'sun', 'mon', etc.
    cron_hour = Column(Integer, nullable=True)        # 0-23
    cron_minute = Column(Integer, nullable=True)      # 0-59
    
    # Market hours constraints
    only_market_hours = Column(Boolean, nullable=False, default=False)
    market_start_hour = Column(Integer, nullable=True, default=9)    # 9 AM
    market_end_hour = Column(Integer, nullable=True, default=16)     # 4 PM
    
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class JobExecutionStatus(Base):
    __tablename__ = "job_execution_status"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String, nullable=False)
    status = Column(String, nullable=False)  # 'running', 'completed', 'failed', 'skipped'
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    records_processed = Column(BigInteger, nullable=True, default=0)
    error_message = Column(Text, nullable=True)
    next_run_at = Column(DateTime, nullable=True)

# Indexes (avoid conflicts with existing app models)
try:
    # Only create indexes if we're using the fallback Symbol model
    from app.models.symbol import Symbol as AppSymbol
    # App models already have the Symbol indexes
except Exception:
    # Create indexes only in fallback case
    Index('symbols_exchange_idx', Symbol.listing_exchange)
    Index('symbols_etf_idx', Symbol.etf)
    Index('symbols_name_idx', Symbol.security_name)

Index("historical_prices_symbol_date_idx", HistoricalPrice.symbol, HistoricalPrice.date)
Index("import_jobs_status_idx", ImportJob.status)
Index("import_errors_job_idx", ImportError.import_job_id)
Index("failed_files_job_idx", FailedFile.import_job_id)
Index("failed_files_status_idx", FailedFile.status)
Index("eod_scans_status_idx", EodScan.status)
Index("eod_scan_errors_scan_idx", EodScanError.eod_scan_id)

# --- Technical indicator tables ---
class TechnicalDaily(Base):
    __tablename__ = "technical_daily"

    symbol = Column(String, primary_key=True)
    date   = Column(String, primary_key=True)  # YYYY-MM-DD
    close  = Column(Float, nullable=False)
    volume = Column(Integer, nullable=False)
    sma20  = Column(Float); sma50 = Column(Float); sma200 = Column(Float)
    rsi14  = Column(Float); adx14 = Column(Float)
    atr14  = Column(Float)
    donch20_high = Column(Float); donch20_low = Column(Float)
    macd = Column(Float); macd_signal = Column(Float); macd_hist = Column(Float)
    avg_vol20 = Column(Float)
    high_252  = Column(Float)

Index("tech_daily_symbol_date_idx", TechnicalDaily.symbol, TechnicalDaily.date)


class TechnicalLatest(Base):
    __tablename__ = "technical_latest"

    symbol = Column(String, primary_key=True)
    date   = Column(String, nullable=False)
    close  = Column(Float, nullable=False)
    volume = Column(Integer, nullable=False)
    sma20  = Column(Float); sma50 = Column(Float); sma200 = Column(Float)
    rsi14  = Column(Float); adx14 = Column(Float)
    atr14  = Column(Float)
    donch20_high = Column(Float); donch20_low = Column(Float)
    macd = Column(Float); macd_signal = Column(Float); macd_hist = Column(Float)
    avg_vol20 = Column(Float)
    high_252  = Column(Float)
    # derived for screener
    distance_to_52w_high = Column(Float)   # (high_252 - close)/high_252
    rel_volume = Column(Float)             # volume/avg_vol20
    sma_slope  = Column(Float)             # sma20 - sma50


class TechJob(Base):
    __tablename__ = "tech_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at  = Column(String, nullable=False)  # ISO UTC
    finished_at = Column(String)
    status = Column(String, nullable=False)       # running|success|partial|failed
    latest_trade_date = Column(String, nullable=False)
    total_symbols = Column(Integer, default=0)
    updated_symbols = Column(Integer, default=0)
    daily_rows_upserted = Column(Integer, default=0)
    latest_rows_upserted = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    message = Column(String, default="")


class TechJobError(Base):
    __tablename__ = "tech_job_errors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tech_job_id = Column(Integer, nullable=False)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    symbol = Column(String, nullable=True)
    error_message = Column(Text, nullable=False)

# Import config from centralized location
try:
    from app.core.config import DATABASE_URL, DATA_DIR
except Exception:
    # Fallback for when running outside of app context
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://stockuser:StockPass2024!@host.docker.internal:5432/stockwatchlist")
    DATA_DIR = os.getenv("DATA_DIR", "./data")

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
