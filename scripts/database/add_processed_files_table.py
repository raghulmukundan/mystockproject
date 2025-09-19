#!/usr/bin/env python3
"""
Script to add processed_files table for import resume functionality
"""

import os
import psycopg2
from psycopg2 import sql

# Database connection parameters
DATABASE_URL = "postgresql://stockuser:StockPass2024!@localhost:5432/stockwatchlist"

def add_processed_files_table():
    """Create processed_files table for tracking import progress"""
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("Connected to PostgreSQL database")
        
        # Check if table already exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'processed_files'
            );
        """)
        
        table_exists = cursor.fetchone()[0]
        
        if table_exists:
            print("processed_files table already exists")
        else:
            print("Creating processed_files table...")
            
            # Create the table
            create_table_sql = """
            CREATE TABLE processed_files (
                id SERIAL PRIMARY KEY,
                import_job_id INTEGER NOT NULL,
                file_path VARCHAR NOT NULL,
                file_size BIGINT NOT NULL,
                file_modified_time TIMESTAMP NOT NULL,
                rows_processed INTEGER NOT NULL DEFAULT 0,
                rows_inserted INTEGER NOT NULL DEFAULT 0,
                rows_updated INTEGER NOT NULL DEFAULT 0,
                processing_start TIMESTAMP NOT NULL DEFAULT NOW(),
                processing_end TIMESTAMP,
                checksum VARCHAR,
                status VARCHAR NOT NULL DEFAULT 'processing'
            );
            """
            
            cursor.execute(create_table_sql)
            
            # Create indexes for performance
            indexes = [
                "CREATE INDEX processed_files_job_idx ON processed_files(import_job_id);",
                "CREATE INDEX processed_files_path_idx ON processed_files(file_path);",
                "CREATE INDEX processed_files_status_idx ON processed_files(status);",
                "CREATE UNIQUE INDEX processed_files_job_path_idx ON processed_files(import_job_id, file_path);"
            ]
            
            for index_sql in indexes:
                print(f"Creating index...")
                cursor.execute(index_sql)
            
            print("processed_files table created successfully")
        
        # Commit the changes
        conn.commit()
        
        # Verify the table structure
        cursor.execute("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'processed_files' 
            ORDER BY ordinal_position;
        """)
        
        columns = cursor.fetchall()
        print(f"Table structure verified. Columns: {len(columns)}")
        for col in columns:
            print(f"  - {col[0]} ({col[1]}) {'NULL' if col[2] == 'YES' else 'NOT NULL'}")
        
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
    success = add_processed_files_table()
    if success:
        print("processed_files table setup completed successfully")
    else:
        print("Failed to setup processed_files table")