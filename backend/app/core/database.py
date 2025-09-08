from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import DATABASE_URL

def configure_sqlite_pragmas(connection, connection_record):
    """Configure SQLite pragmas - avoid WAL mode to prevent Docker issues"""
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=DELETE")  # Use DELETE mode instead of WAL
        connection.execute("PRAGMA synchronous=NORMAL")
        connection.execute("PRAGMA cache_size=10000")
        print("Successfully set SQLite pragmas (DELETE mode)")
    except Exception as e:
        print(f"Warning: Could not set SQLite pragmas: {e}")
        # Continue without pragmas if needed

# Improved SQLite configuration for better concurrent access
engine = create_engine(
    DATABASE_URL, 
    connect_args={
        "check_same_thread": False,
        "timeout": 20,  # 20 second timeout for database operations
    },
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=300,    # Recycle connections every 5 minutes
)

# Re-enable SQLite pragmas with better error handling
event.listen(engine, "connect", configure_sqlite_pragmas)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    print("Initializing clean database...")
    try:
        from app.models import watchlist, watchlist_item, rule, symbol, price_daily, current_price
        Base.metadata.create_all(bind=engine)
        print("Database initialized successfully")
    except Exception as e:
        print(f"Error initializing database: {e}")
        raise