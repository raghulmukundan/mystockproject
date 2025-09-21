from sqlalchemy import Column, String, Float, Integer, DateTime, BigInteger
from sqlalchemy.sql import func
from app.core.database import Base
from datetime import datetime, timezone

class CurrentPrice(Base):
    __tablename__ = 'current_prices'

    symbol = Column(String, primary_key=True, index=True)
    current_price = Column(Float, nullable=False)
    change_amount = Column(Float)
    change_percent = Column(Float)
    volume = Column(Integer)
    market_cap = Column(BigInteger)
    last_updated = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    source = Column(String, default='finnhub')

    def __repr__(self):
        return f"<CurrentPrice(symbol='{self.symbol}', price={self.current_price}, updated='{self.last_updated}')>"

    def to_dict(self):
        return {
            'symbol': self.symbol,
            'current_price': self.current_price,
            'change': self.change_amount,
            'change_percent': self.change_percent,
            'volume': self.volume,
            'market_cap': self.market_cap,
            'last_updated': self.last_updated.isoformat() if self.last_updated else None,
            'source': self.source
        }