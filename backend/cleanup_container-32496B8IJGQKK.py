#!/usr/bin/env python3

import sys
import os

# Add the current directory to path
sys.path.append('/app/src')

from sqlalchemy import text, create_engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def cleanup_all_data():
    """Clean up all import and historical data"""
    logger.info("Cleaning up all import and historical data...")
    
    # Use Docker container database URL
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://stockuser:stockpass123@postgres:5432/stockwatchlist")
    
    try:
        engine = create_engine(DATABASE_URL)
        
        with engine.connect() as conn:
            # Clean up import-related tables
            logger.info("Deleting import errors...")
            result = conn.execute(text("DELETE FROM import_errors"))
            logger.info(f"Deleted {result.rowcount} import errors")
            
            logger.info("Deleting processed files...")
            result = conn.execute(text("DELETE FROM processed_files"))
            logger.info(f"Deleted {result.rowcount} processed files")
            
            logger.info("Deleting import jobs...")
            result = conn.execute(text("DELETE FROM import_jobs"))
            logger.info(f"Deleted {result.rowcount} import jobs")
            
            # Clean up historical prices
            logger.info("Deleting historical prices...")
            result = conn.execute(text("DELETE FROM historical_prices"))
            logger.info(f"Deleted {result.rowcount} historical price records")
            
            # Commit the transaction
            conn.commit()
            
            logger.info("All data cleaned up successfully!")
            
            # Verify cleanup
            logger.info("\nVerifying cleanup:")
            result = conn.execute(text("SELECT count(*) FROM import_jobs"))
            logger.info(f"Import jobs remaining: {result.scalar()}")
            
            result = conn.execute(text("SELECT count(*) FROM historical_prices"))
            logger.info(f"Historical prices remaining: {result.scalar()}")
            
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        return False
        
    return True

if __name__ == "__main__":
    success = cleanup_all_data()
    if success:
        logger.info("\nDatabase cleanup completed successfully!")
    else:
        logger.error("\nDatabase cleanup failed!")
        sys.exit(1)