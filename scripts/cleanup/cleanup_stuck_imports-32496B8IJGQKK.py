#!/usr/bin/env python3
"""
Script to clean up stuck import jobs and reset database state
"""

import os
import psycopg2
from psycopg2 import sql

# Database connection parameters
DATABASE_URL = "postgresql://stockuser:stockpass123@localhost:5432/stockwatchlist"

def cleanup_stuck_imports():
    """Clean up stuck or failed import jobs"""
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        print("Connected to PostgreSQL database")
        
        # Find stuck import jobs (running for more than 1 hour)
        cursor.execute("""
            SELECT id, status, folder_path, started_at 
            FROM import_jobs 
            WHERE status = 'running' 
            AND started_at < NOW() - INTERVAL '1 hour'
            ORDER BY started_at DESC;
        """)
        
        stuck_jobs = cursor.fetchall()
        print(f"Found {len(stuck_jobs)} stuck import jobs:")
        
        for job in stuck_jobs:
            print(f"  Job #{job[0]}: {job[1]} - {job[2]} - Started: {job[3]}")
        
        if stuck_jobs:
            # Mark stuck jobs as failed
            stuck_job_ids = [job[0] for job in stuck_jobs]
            cursor.execute("""
                UPDATE import_jobs 
                SET status = 'failed', completed_at = NOW()
                WHERE id = ANY(%s);
            """, (stuck_job_ids,))
            
            print(f"Marked {len(stuck_jobs)} stuck jobs as failed")
        
        # Show current import job status
        cursor.execute("""
            SELECT status, COUNT(*) as count 
            FROM import_jobs 
            GROUP BY status 
            ORDER BY status;
        """)
        
        status_counts = cursor.fetchall()
        print("\nCurrent import job status counts:")
        for status, count in status_counts:
            print(f"  {status}: {count}")
        
        # Clean up any orphaned processed_files entries
        cursor.execute("""
            DELETE FROM processed_files 
            WHERE import_job_id NOT IN (SELECT id FROM import_jobs);
        """)
        
        orphaned_count = cursor.rowcount
        if orphaned_count > 0:
            print(f"Cleaned up {orphaned_count} orphaned processed file records")
        
        # Commit the changes
        conn.commit()
        print("Database cleanup completed successfully")
        
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
    success = cleanup_stuck_imports()
    if success:
        print("Import job cleanup completed successfully")
    else:
        print("Failed to cleanup import jobs")