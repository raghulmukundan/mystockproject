#!/usr/bin/env python3
"""
Truncate the current_prices table (use with caution).

This is safe to run before repurposing current_prices for a different schema.
"""
import psycopg2
from backend.common.database import get_database_url

DATABASE_URL = get_database_url()

def main():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()
    try:
        cur.execute("TRUNCATE TABLE current_prices")
        print("current_prices table truncated.")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()

