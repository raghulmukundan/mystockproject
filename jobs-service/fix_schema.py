#!/usr/bin/env python3
"""
Fix database schema by adding missing columns
"""
import os
from sqlalchemy import create_engine, text
from app.core.config import DATABASE_URL

def fix_schema():
    """Add missing columns to existing tables"""
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        # First, check the current schema of eod_scan_errors
        try:
            print("Checking current eod_scan_errors schema...")
            result = conn.execute(text("""
                SELECT column_name, is_nullable, data_type
                FROM information_schema.columns
                WHERE table_name = 'eod_scan_errors'
                ORDER BY ordinal_position
            """))
            columns = result.fetchall()
            print(f"Current columns: {[f'{col[0]} ({col[2]}, nullable: {col[1]})' for col in columns]}")

            # Drop the occurred_at column if it exists (old schema)
            for col_name, nullable, data_type in columns:
                if col_name == 'occurred_at':
                    print("Dropping old occurred_at column...")
                    conn.execute(text("ALTER TABLE eod_scan_errors DROP COLUMN occurred_at"))
                    conn.commit()
                    print("✅ Dropped occurred_at column")

            # Add created_at column if it doesn't exist
            has_created_at = any(col[0] == 'created_at' for col in columns)
            if not has_created_at:
                print("Adding created_at column to eod_scan_errors table...")
                conn.execute(text("""
                    ALTER TABLE eod_scan_errors
                    ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                """))
                conn.commit()
                print("✅ Added created_at column to eod_scan_errors")
            else:
                print("✅ created_at column already exists in eod_scan_errors")

        except Exception as e:
            print(f"❌ Error fixing eod_scan_errors: {e}")

        # Check and create all other tables if they don't exist
        try:
            # Import models to register them
            from app.db.models import Base
            Base.metadata.create_all(bind=engine)
            print("✅ All other tables created/verified")
        except Exception as e:
            print(f"❌ Error creating tables: {e}")

if __name__ == "__main__":
    fix_schema()