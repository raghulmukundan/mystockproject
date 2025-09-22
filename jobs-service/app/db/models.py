"""
Database models for Jobs Service
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, BigInteger, Float, Index, Numeric, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timezone

Base = declarative_base()

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
    
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
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

class CachedPrice(Base):
    __tablename__ = "cached_prices"
    
    symbol = Column(String, primary_key=True)
    current_price = Column(Float, nullable=False)
    change_amount = Column(Float, nullable=True)
    change_percent = Column(Float, nullable=True)
    volume = Column(BigInteger, nullable=True)
    market_cap = Column(BigInteger, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'symbol': self.symbol,
            'current_price': self.current_price,
            'change': self.change_amount,
            'change_percent': self.change_percent,
            'volume': self.volume,
            'market_cap': self.market_cap,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

# Business models for EOD scan functionality
class Symbol(Base):
    __tablename__ = 'symbols'

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String, nullable=False, unique=True)
    company_name = Column(String)
    market_category = Column(String)
    test_issue = Column(String)
    financial_status = Column(String)
    round_lot_size = Column(Integer)
    etf = Column(String)
    next_shares = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class DailyOHLCPrice(Base):
    __tablename__ = "prices_daily_ohlc"

    symbol = Column(String, primary_key=True)   # e.g., AAPL
    date = Column(String, primary_key=True)     # YYYY-MM-DD
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Integer, nullable=False, default=0)
    source = Column(String, nullable=False, default="schwab")

class EodScan(Base):
    __tablename__ = 'eod_scans'

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default='running')
    scan_date = Column(String, nullable=False)
    symbols_requested = Column(Integer, nullable=True, default=0)
    symbols_fetched = Column(Integer, nullable=True, default=0)
    error_count = Column(Integer, nullable=True, default=0)

class EodScanError(Base):
    __tablename__ = 'eod_scan_errors'

    id = Column(Integer, primary_key=True, autoincrement=True)
    eod_scan_id = Column(Integer, ForeignKey('eod_scans.id'), nullable=False)
    symbol = Column(String, nullable=False)
    error_type = Column(String, nullable=False)
    error_message = Column(Text, nullable=True)
    http_status = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Indexes for performance
Index('job_execution_status_job_name_idx', JobExecutionStatus.job_name)
Index('job_execution_status_started_at_idx', JobExecutionStatus.started_at)
Index('cached_prices_updated_at_idx', CachedPrice.updated_at)
Index('symbols_symbol_idx', Symbol.symbol)
Index('prices_daily_ohlc_symbol_date_idx', DailyOHLCPrice.symbol, DailyOHLCPrice.date)
Index('eod_scans_started_at_idx', EodScan.started_at)
Index('eod_scan_errors_scan_id_idx', EodScanError.eod_scan_id)