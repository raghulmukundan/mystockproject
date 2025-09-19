#!/usr/bin/env python3
"""
Script to fix PostgreSQL integer out of range error by changing volume and open_interest columns to BIGINT
"""

import os
import psycopg2
from psycopg2 import sql

# Database connection parameters
DATABASE_URL = "postgresql://stockuser:StockPass2024!@localhost:5432/stockwatchlist"

def fix_integer_columns():
    """Alter volume and open_interest columns from integer to bigint"""
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("Connected to PostgreSQL database")
        
        # Check if the table exists and get current column types
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'historical_prices' 
            AND column_name IN ('volume', 'open_interest')
            ORDER BY column_name;
        """)
        
        columns = cursor.fetchall()
        print(f"Current column types: {columns}")
        
        if not columns:
            print("historical_prices table not found or columns don't exist")
            return False
        
        # Alter volume column to BIGINT
        print("Altering volume column to BIGINT...")
        cursor.execute("ALTER TABLE historical_prices ALTER COLUMN volume TYPE BIGINT;")
        
        # Alter open_interest column to BIGINT  
        print("Altering open_interest column to BIGINT...")
        cursor.execute("ALTER TABLE historical_prices ALTER COLUMN open_interest TYPE BIGINT;")
        
        # Commit the changes
        conn.commit()
        print("Successfully altered columns to BIGINT")
        
        # Verify the changes
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'historical_prices' 
            AND column_name IN ('volume', 'open_interest')
            ORDER BY column_name;
        """)
        
        columns_after = cursor.fetchall()
        print(f"Updated column types: {columns_after}")
        
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
    success = fix_integer_columns()
    if success:
        print("✅ Column types successfully updated to BIGINT")
    else:
        print("❌ Failed to update column types")