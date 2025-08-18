from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Rule(Base):
    __tablename__ = "rules"

    id = Column(Integer, primary_key=True, index=True)
    watchlist_item_id = Column(Integer, ForeignKey("watchlist_items.id"), nullable=False)
    name = Column(String(255), nullable=False)
    expression = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_triggered = Column(DateTime(timezone=True))

    watchlist_item = relationship("WatchlistItem", back_populates="rules")