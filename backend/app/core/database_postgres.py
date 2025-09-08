from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import DATABASE_URL
import logging

logger = logging.getLogger(__name__)

# PostgreSQL optimized engine configuration
engine = create_engine(
    DATABASE_URL,
    # PostgreSQL specific optimizations
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
Base = declarative_base()

def get_db():
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize PostgreSQL database tables"""
    logger.info("Initializing PostgreSQL database...")
    try:
        # Import all models to ensure they're registered with SQLAlchemy
        from app.models import watchlist, watchlist_item, rule, symbol, price_daily, current_price
        from src.db.models import HistoricalPrice, AssetMetadata, ImportJob, ImportError
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        logger.info("PostgreSQL database initialized successfully")
        
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise

def get_db_info():
    """Get PostgreSQL database connection information"""
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            result = conn.execute(text("SELECT version()"))
            return {"type": "PostgreSQL", "version": result.fetchone()[0]}
    except Exception as e:
        return {"type": "PostgreSQL", "error": str(e)}