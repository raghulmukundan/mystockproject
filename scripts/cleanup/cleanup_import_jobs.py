#!/usr/bin/env python3
"""
Cleanup script to clear all import jobs and related data
"""
import sys
import os

# Add the backend directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from src.db.models import ImportJob, ImportError, ProcessedFile
from app.core.database import DATABASE_URL

def cleanup_import_data():
    """Clean up all import-related data from database"""
    try:
        engine = create_engine(DATABASE_URL)
        Session = sessionmaker(bind=engine)
        session = Session()
        
        print("Cleaning up import data...")
        
        # Delete all import errors
        deleted_errors = session.query(ImportError).delete()
        print(f"Deleted {deleted_errors} import errors")
        
        # Delete all processed files
        deleted_files = session.query(ProcessedFile).delete()
        print(f"Deleted {deleted_files} processed file records")
        
        # Delete all import jobs
        deleted_jobs = session.query(ImportJob).delete()
        print(f"Deleted {deleted_jobs} import jobs")
        
        session.commit()
        session.close()
        
        print("✅ Import data cleanup completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error cleaning up import data: {e}")
        return False

if __name__ == "__main__":
    success = cleanup_import_data()
    sys.exit(0 if success else 1)