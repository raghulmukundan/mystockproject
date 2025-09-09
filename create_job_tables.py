#!/usr/bin/env python3
"""
Script to create job configuration and status tables
"""

import os
import psycopg2
from psycopg2 import sql

# Database connection parameters
DATABASE_URL = "postgresql://stockuser:StockPass2024!@localhost:5432/stockwatchlist"

def create_job_tables():
    """Create job_configurations and job_execution_status tables"""
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("Connected to PostgreSQL database")
        
        # Create job_configurations table
        print("Creating job_configurations table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS job_configurations (
                id SERIAL PRIMARY KEY,
                job_name VARCHAR UNIQUE NOT NULL,
                description VARCHAR NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT true,
                schedule_type VARCHAR NOT NULL,
                interval_value INTEGER,
                interval_unit VARCHAR,
                cron_day_of_week VARCHAR,
                cron_hour INTEGER,
                cron_minute INTEGER,
                only_market_hours BOOLEAN NOT NULL DEFAULT false,
                market_start_hour INTEGER DEFAULT 9,
                market_end_hour INTEGER DEFAULT 16,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        """)
        
        # Create job_execution_status table
        print("Creating job_execution_status table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS job_execution_status (
                id SERIAL PRIMARY KEY,
                job_name VARCHAR NOT NULL,
                status VARCHAR NOT NULL,
                started_at TIMESTAMP NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMP,
                duration_seconds INTEGER,
                records_processed BIGINT DEFAULT 0,
                error_message TEXT,
                next_run_at TIMESTAMP
            );
        """)
        
        # Create indexes
        print("Creating indexes...")
        indexes = [
            "CREATE INDEX IF NOT EXISTS job_config_name_idx ON job_configurations(job_name);",
            "CREATE INDEX IF NOT EXISTS job_config_enabled_idx ON job_configurations(enabled);",
            "CREATE INDEX IF NOT EXISTS job_status_name_idx ON job_execution_status(job_name);",
            "CREATE INDEX IF NOT EXISTS job_status_started_idx ON job_execution_status(started_at DESC);",
            "CREATE INDEX IF NOT EXISTS job_status_next_run_idx ON job_execution_status(next_run_at);"
        ]
        
        for index_sql in indexes:
            cursor.execute(index_sql)
        
        # Insert default job configurations
        print("Inserting default job configurations...")
        
        # Market data refresh job (every 30 minutes during market hours)
        cursor.execute("""
            INSERT INTO job_configurations (
                job_name, description, schedule_type, interval_value, interval_unit, only_market_hours
            ) VALUES (
                'market_data_refresh', 'Refresh current market data for watchlists', 'interval', 30, 'minutes', true
            ) ON CONFLICT (job_name) DO NOTHING;
        """)
        
        # NASDAQ universe refresh (Sunday 8 AM)
        cursor.execute("""
            INSERT INTO job_configurations (
                job_name, description, schedule_type, cron_day_of_week, cron_hour, cron_minute, only_market_hours
            ) VALUES (
                'nasdaq_universe_refresh', 'Refresh NASDAQ universe symbols', 'cron', 'sun', 8, 0, false
            ) ON CONFLICT (job_name) DO NOTHING;
        """)
        
        # EOD price scan (weekdays at 5:30 PM)
        cursor.execute("""
            INSERT INTO job_configurations (
                job_name, description, schedule_type, cron_day_of_week, cron_hour, cron_minute, only_market_hours
            ) VALUES (
                'eod_price_scan', 'End-of-day price scan using Schwab API', 'cron', 'mon,tue,wed,thu,fri', 17, 30, false
            ) ON CONFLICT (job_name) DO NOTHING;
        """)
        
        # Commit the changes
        conn.commit()
        print("Job tables created successfully with default configurations")
        
        # Verify the tables
        cursor.execute("SELECT job_name, description, enabled FROM job_configurations ORDER BY job_name;")
        configs = cursor.fetchall()
        print(f"\nCreated job configurations:")
        for config in configs:
            print(f"  - {config[0]}: {config[1]} (enabled: {config[2]})")
        
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
    success = create_job_tables()
    if success:
        print("Job configuration system setup completed successfully")
    else:
        print("Failed to setup job configuration system")