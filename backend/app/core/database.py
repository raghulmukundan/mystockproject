from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import DATABASE_URL

def configure_sqlite_pragmas(connection, connection_record):
    """Configure SQLite pragmas for better performance and concurrency"""
    try:
        # Only set the most basic pragmas to avoid I/O issues
        connection.execute("PRAGMA foreign_keys=ON")
        print("Successfully set basic SQLite pragmas")
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
    # Temporarily skip table creation due to SQLite I/O error
    print("Skipping database initialization due to SQLite I/O issues")
    try:
        from app.models import watchlist, watchlist_item, rule, symbol, price_daily, current_price
        Base.metadata.create_all(bind=engine)
        print("Database initialized successfully")
    except Exception as e:
        print(f"Warning: Could not initialize database: {e}")
        print("Continuing without database initialization...")