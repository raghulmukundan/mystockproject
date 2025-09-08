from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import DATABASE_URL
import logging

logger = logging.getLogger(__name__)

def get_engine_config():
    """Get PostgreSQL database engine configuration"""
    # PostgreSQL configuration
    return {
        'pool_size': 20,                    # Connection pool size
        'max_overflow': 30,                 # Max overflow connections  
        'pool_pre_ping': True,              # Verify connections before use
        'pool_recycle': 3600,               # Recycle connections every hour
        'echo': False,                      # Set to True for SQL debugging
        'connect_args': {
            "application_name": "stock_watchlist_api",
            "options": "-c timezone=UTC"
        }
    }

# Create engine with PostgreSQL configuration
engine = create_engine(DATABASE_URL, **get_engine_config())
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize PostgreSQL database with proper logging"""
    print("Initializing PostgreSQL database...")
    logger.info("Using PostgreSQL database")
        
    try:
        # Import all models to ensure they're registered
        from app.models import watchlist, watchlist_item, rule, symbol, price_daily, current_price
        
        # Import src models for historical data
        try:
            from src.db.models import HistoricalPrice, AssetMetadata, ImportJob, ImportError
        except ImportError as e:
            logger.warning(f"Could not import src models: {e}")
            
        # Create all tables
        Base.metadata.create_all(bind=engine)
        
        # Test PostgreSQL database connection
        with engine.connect() as conn:
            from sqlalchemy import text
            result = conn.execute(text("SELECT version()"))
            version = result.fetchone()[0]
            print(f"PostgreSQL database initialized successfully")
            print(f"Database version: {version}")
            logger.info(f"Connected to PostgreSQL: {version}")
                
    except Exception as e:
        print(f"Error initializing database: {e}")
        logger.error(f"Database initialization failed: {e}")
        raise