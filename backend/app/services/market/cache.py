from sqlalchemy import Column, String, Float, Integer, Date, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()

class PriceData(Base):
    __tablename__ = "prices"
    
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Integer, nullable=False)
    
    __table_args__ = {"extend_existing": True}

class PriceCache:
    def __init__(self, database_url: str):
        self.engine = create_engine(database_url, echo=False)
        Base.metadata.create_all(bind=self.engine)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.session = SessionLocal()
    
    def get_cached_data(
        self, 
        symbol: str, 
        start_date: datetime, 
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get cached price data for a symbol within date range
        Returns normalized format: [{date: 'YYYY-MM-DD', open, high, low, close, volume}, ...]
        """
        try:
            start_date_obj = start_date.date()
            end_date_obj = end_date.date()
            
            records = self.session.query(PriceData).filter(
                PriceData.symbol == symbol.upper(),
                PriceData.date >= start_date_obj,
                PriceData.date <= end_date_obj
            ).order_by(PriceData.date).all()
            
            return [
                {
                    'date': record.date.strftime('%Y-%m-%d'),
                    'open': record.open,
                    'high': record.high,
                    'low': record.low,
                    'close': record.close,
                    'volume': record.volume
                }
                for record in records
            ]
        except Exception as e:
            logger.error(f"Error getting cached data for {symbol}: {e}")
            return []
    
    def get_cache_date_range(self, symbol: str) -> Tuple[Optional[date], Optional[date]]:
        """
        Get the start and end dates of cached data for a symbol
        Returns (earliest_date, latest_date) or (None, None) if no data
        """
        try:
            result = self.session.query(
                PriceData.date.label('date')
            ).filter(
                PriceData.symbol == symbol.upper()
            ).order_by(PriceData.date).first()
            
            if not result:
                return None, None
            
            earliest = result.date
            
            result = self.session.query(
                PriceData.date.label('date')
            ).filter(
                PriceData.symbol == symbol.upper()
            ).order_by(PriceData.date.desc()).first()
            
            latest = result.date if result else earliest
            
            return earliest, latest
        except Exception as e:
            logger.error(f"Error getting cache range for {symbol}: {e}")
            return None, None
    
    def upsert_candle_data(self, symbol: str, candles: List[Dict[str, Any]]) -> int:
        """
        Insert or update candle data in cache
        Returns number of records upserted
        """
        try:
            count = 0
            for candle in candles:
                candle_date = datetime.strptime(candle['date'], '%Y-%m-%d').date()
                
                # Check if record exists
                existing = self.session.query(PriceData).filter(
                    PriceData.symbol == symbol.upper(),
                    PriceData.date == candle_date
                ).first()
                
                if existing:
                    # Update existing record
                    existing.open = candle['open']
                    existing.high = candle['high']
                    existing.low = candle['low']
                    existing.close = candle['close']
                    existing.volume = candle['volume']
                else:
                    # Insert new record
                    record = PriceData(
                        symbol=symbol.upper(),
                        date=candle_date,
                        open=candle['open'],
                        high=candle['high'],
                        low=candle['low'],
                        close=candle['close'],
                        volume=candle['volume']
                    )
                    self.session.add(record)
                
                count += 1
            
            self.session.commit()
            return count
        except Exception as e:
            logger.error(f"Error upserting data for {symbol}: {e}")
            self.session.rollback()
            return 0
    
    def close(self):
        """Close the database session"""
        self.session.close()