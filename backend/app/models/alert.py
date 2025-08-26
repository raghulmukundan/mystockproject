from datetime import datetime
from enum import Enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, Enum as SQLEnum
from app.core.database import Base

class AlertType(str, Enum):
    SECTOR_CONCENTRATION = "sector_concentration"
    HIGH_CORRELATION = "high_correlation"
    VOLATILITY_SPIKE = "volatility_spike"
    VOLUME_ANOMALY = "volume_anomaly"
    PRICE_TARGET_BREACH = "price_target_breach"
    PORTFOLIO_RISK = "portfolio_risk"
    PERFORMANCE_OUTLIER = "performance_outlier"
    DIVERSIFICATION_WARNING = "diversification_warning"

class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    alert_type = Column(SQLEnum(AlertType), nullable=False)
    severity = Column(SQLEnum(AlertSeverity), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    
    # Optional associated data
    watchlist_id = Column(Integer, nullable=True)  # Associated watchlist
    symbol = Column(String(10), nullable=True)     # Associated stock symbol
    value = Column(Float, nullable=True)           # Numeric value (percentage, ratio, etc.)
    threshold = Column(Float, nullable=True)       # Threshold that was breached
    
    # Metadata
    is_active = Column(Boolean, default=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    
    # Additional context data (JSON-like storage)
    context_data = Column(Text, nullable=True)  # JSON string for additional data
    
    def __repr__(self):
        return f"<Alert(type={self.alert_type}, severity={self.severity}, title='{self.title}')>"
    
    def to_dict(self):
        return {
            "id": self.id,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "title": self.title,
            "message": self.message,
            "watchlist_id": self.watchlist_id,
            "symbol": self.symbol,
            "value": self.value,
            "threshold": self.threshold,
            "is_active": self.is_active,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "context_data": self.context_data
        }