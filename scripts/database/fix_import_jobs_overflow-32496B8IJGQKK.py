#!/usr/bin/env python3
"""
Script to fix integer overflow in import_jobs table by changing row count columns to BIGINT
"""

import os
import psycopg2
from psycopg2 import sql

# Database connection parameters
DATABASE_URL = "postgresql://stockuser:stockpass123@localhost:5432/stockwatchlist"

def fix_import_jobs_overflow():
    """Change row count columns in import_jobs table from integer to bigint"""
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("Connected to PostgreSQL database")
        
        # Check current column types
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'import_jobs' 
            AND column_name IN ('total_files', 'processed_files', 'total_rows', 'inserted_rows', 'error_count')
            ORDER BY column_name;
        """)
        
        current_types = cursor.fetchall()
        print(f"Current column types: {current_types}")
        
        # Alter columns to BIGINT to handle large row counts
        columns_to_alter = [
            'total_files',
            'processed_files', 
            'total_rows',
            'inserted_rows',
            'error_count'
        ]
        
        for column in columns_to_alter:
            print(f"Altering {column} column to BIGINT...")
            cursor.execute(f"ALTER TABLE import_jobs ALTER COLUMN {column} TYPE BIGINT;")
        
        # Commit the changes
        conn.commit()
        print("Successfully altered all row count columns to BIGINT")
        
        # Verify the changes
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'import_jobs' 
            AND column_name IN ('total_files', 'processed_files', 'total_rows', 'inserted_rows', 'error_count')
            ORDER BY column_name;
        """)
        
        updated_types = cursor.fetchall()
        print(f"Updated column types: {updated_types}")
        
        return True
        
    except psycopg2.Error as e:
        print(f"PostgreSQL error: {e}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
        print("Database connection closed")

if __name__ == "__main__":
    success = fix_import_jobs_overflow()
    if success:
        print("✅ Import jobs integer overflow fixed successfully")
    else:
        print("❌ Failed to fix import jobs integer overflow")