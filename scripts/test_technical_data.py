#!/usr/bin/env python3
"""Test script to verify technical indicators are populated"""

import psycopg2
import sys

def test_technical_data():
    try:
        # Connect to the database
        conn = psycopg2.connect(
            host="localhost",
            port="5432",
            database="stockwatchlist",
            user="stockuser",
            password="stockpass"
        )

        cursor = conn.cursor()

        # Test technical_latest table for AAPL
        cursor.execute("""
            SELECT symbol, date, close, volume, sma20, sma50, sma200, rsi14, adx14
            FROM technical_latest
            WHERE symbol = 'AAPL'
            LIMIT 1
        """)

        result = cursor.fetchone()
        if result:
            symbol, date, close, volume, sma20, sma50, sma200, rsi14, adx14 = result
            print(f"AAPL Technical Data:")
            print(f"  Symbol: {symbol}")
            print(f"  Date: {date}")
            print(f"  Close: {close}")
            print(f"  Volume: {volume}")
            print(f"  SMA20: {sma20}")
            print(f"  SMA50: {sma50}")
            print(f"  SMA200: {sma200}")
            print(f"  RSI14: {rsi14}")
            print(f"  ADX14: {adx14}")

            # Check if indicators are populated
            if sma20 is not None and sma50 is not None:
                print("\n✅ SUCCESS: Technical indicators are populated!")
            else:
                print("\n❌ FAILED: Technical indicators are still null")
        else:
            print("❌ No data found for AAPL in technical_latest")

        # Check how many symbols have technical data
        cursor.execute("""
            SELECT COUNT(*) as total_symbols,
                   COUNT(sma20) as symbols_with_sma20,
                   COUNT(sma50) as symbols_with_sma50,
                   COUNT(rsi14) as symbols_with_rsi14
            FROM technical_latest
        """)

        stats = cursor.fetchone()
        if stats:
            total, sma20_count, sma50_count, rsi_count = stats
            print(f"\nTechnical Data Statistics:")
            print(f"  Total symbols: {total}")
            print(f"  Symbols with SMA20: {sma20_count}")
            print(f"  Symbols with SMA50: {sma50_count}")
            print(f"  Symbols with RSI14: {rsi_count}")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_technical_data()