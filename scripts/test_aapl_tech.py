#!/usr/bin/env python3
"""Test script to check AAPL technical indicators"""

import psycopg2
import sys

def test_aapl_tech():
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
            print(f"AAPL Technical Data (latest):")
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
                print("\nSUCCESS: Technical indicators are populated!")
            else:
                print("\nFAILED: Technical indicators are still null")
        else:
            print("No data found for AAPL in technical_latest")

        # Also check MSFT and NFLX
        for symbol in ['MSFT', 'NFLX']:
            cursor.execute("""
                SELECT symbol, date, close, sma20, sma50, sma200, rsi14
                FROM technical_latest
                WHERE symbol = %s
                LIMIT 1
            """, (symbol,))

            result = cursor.fetchone()
            if result:
                sym, date, close, sma20, sma50, sma200, rsi14 = result
                print(f"\n{symbol}: close={close}, sma20={sma20}, sma50={sma50}, sma200={sma200}, rsi14={rsi14}")
            else:
                print(f"\n{symbol}: No data found")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"Database connection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_aapl_tech()