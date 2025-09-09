#!/usr/bin/env python3
"""
Script to add current_file and current_folder columns to ImportJob table
"""

import os
import psycopg2
from psycopg2 import sql

# Database connection parameters
DATABASE_URL = "postgresql://stockuser:StockPass2024!@localhost:5432/stockwatchlist"

def add_progress_columns():
    """Add current_file and current_folder columns to import_jobs table"""
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("Connected to PostgreSQL database")
        
        # Check if columns already exist
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'import_jobs' 
            AND column_name IN ('current_file', 'current_folder')
            ORDER BY column_name;
        """)
        
        existing_columns = [row[0] for row in cursor.fetchall()]
        print(f"Existing columns: {existing_columns}")
        
        # Add current_file column if it doesn't exist
        if 'current_file' not in existing_columns:
            print("Adding current_file column...")
            cursor.execute("ALTER TABLE import_jobs ADD COLUMN current_file VARCHAR;")
        else:
            print("current_file column already exists")
        
        # Add current_folder column if it doesn't exist
        if 'current_folder' not in existing_columns:
            print("Adding current_folder column...")
            cursor.execute("ALTER TABLE import_jobs ADD COLUMN current_folder VARCHAR;")
        else:
            print("current_folder column already exists")
        
        # Commit the changes
        conn.commit()
        print("Successfully added progress tracking columns")
        
        # Verify the changes
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'import_jobs' 
            AND column_name IN ('current_file', 'current_folder')
            ORDER BY column_name;
        """)
        
        updated_columns = [row[0] for row in cursor.fetchall()]
        print(f"Updated columns: {updated_columns}")
        
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
    success = add_progress_columns()
    if success:
        print("Column addition completed successfully")
    else:
        print("Failed to add columns")