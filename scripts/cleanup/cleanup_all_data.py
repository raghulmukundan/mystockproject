#!/usr/bin/env python3

import sys
import os

# Add backend src to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend', 'src'))

from sqlalchemy import text
from db.models import engine, get_db, ImportJob, ImportError, ProcessedFile, HistoricalPrice

def cleanup_all_data():
    """Clean up all import and historical data"""
    print("Cleaning up all import and historical data...")
    
    try:
        with engine.connect() as conn:
            # Clean up import-related tables
            print("Deleting import errors...")
            result = conn.execute(text("DELETE FROM import_errors"))
            print(f"Deleted {result.rowcount} import errors")
            
            print("Deleting processed files...")
            result = conn.execute(text("DELETE FROM processed_files"))
            print(f"Deleted {result.rowcount} processed files")
            
            print("Deleting import jobs...")
            result = conn.execute(text("DELETE FROM import_jobs"))
            print(f"Deleted {result.rowcount} import jobs")
            
            # Clean up historical prices
            print("Deleting historical prices...")
            result = conn.execute(text("DELETE FROM historical_prices"))
            print(f"Deleted {result.rowcount} historical price records")
            
            # Commit the transaction
            conn.commit()
            
            print("All data cleaned up successfully!")
            
            # Verify cleanup
            print("\nVerifying cleanup:")
            result = conn.execute(text("SELECT count(*) FROM import_jobs"))
            print(f"Import jobs remaining: {result.scalar()}")
            
            result = conn.execute(text("SELECT count(*) FROM historical_prices"))
            print(f"Historical prices remaining: {result.scalar()}")
            
    except Exception as e:
        print(f"Error during cleanup: {e}")
        return False
        
    return True

if __name__ == "__main__":
    success = cleanup_all_data()
    if success:
        print("\nDatabase cleanup completed successfully!")
    else:
        print("\nDatabase cleanup failed!")
        sys.exit(1)