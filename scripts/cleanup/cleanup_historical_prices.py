#!/usr/bin/env python3

import sys
import os

# Add backend src to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'src'))

from sqlalchemy import text, create_engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def cleanup_historical_prices():
    """Clean up historical prices table for fresh import"""
    logger.info("Cleaning up historical prices table...")
    
    # Use Docker container database URL
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://stockuser:stockpass123@host.docker.internal:5432/stockwatchlist")
    
    try:
        engine = create_engine(DATABASE_URL)
        
        with engine.connect() as conn:
            # Clean up historical prices
            logger.info("Deleting all historical prices...")
            result = conn.execute(text("DELETE FROM historical_prices"))
            logger.info(f"Deleted {result.rowcount} historical price records")
            
            # Commit the transaction
            conn.commit()
            
            logger.info("Historical prices cleaned up successfully!")
            
            # Verify cleanup
            logger.info("\nVerifying cleanup:")
            result = conn.execute(text("SELECT count(*) FROM historical_prices"))
            logger.info(f"Historical prices remaining: {result.scalar()}")
            
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        return False
        
    return True

if __name__ == "__main__":
    success = cleanup_historical_prices()
    if success:
        logger.info("\nHistorical prices cleanup completed successfully!")
    else:
        logger.error("\nHistorical prices cleanup failed!")
        sys.exit(1)