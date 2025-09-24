#!/usr/bin/env python3
"""
Truncate the prices_realtime_cache table (use with caution).

This is safe to run before repurposing prices_realtime_cache for a different schema.
"""
import psycopg2
from backend.common.database import get_database_url

DATABASE_URL = get_database_url()

def main():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()
    try:
        cur.execute("TRUNCATE TABLE prices_realtime_cache")
        print("prices_realtime_cache table truncated.")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()

