#!/usr/bin/env python3
"""
One-time script to populate asset_metadata table with sector information from Finnhub
"""

import os
import sys
import requests
import time
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone

# Add the src directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from src.db.models import AssetMetadata, Base

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres123@localhost:5432/mystockproject')

# Finnhub API configuration
EXTERNAL_API_BASE = "http://localhost:8003"

def get_company_info(symbol: str):
    """Get company information from Finnhub via external-apis service"""
    try:
        url = f"{EXTERNAL_API_BASE}/finnhub/company/{symbol}"
        response = requests.get(url, timeout=30)

        if response.status_code == 200:
            data = response.json()
            return {
                'name': data.get('name'),
                'sector': data.get('finnhubIndustry'),
                'exchange': data.get('exchange'),
                'country': data.get('country', 'US').lower(),
                'currency': data.get('currency')
            }
        else:
            print(f"Warning: Failed to get data for {symbol}: HTTP {response.status_code}")
            return None
    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}")
        return None

def populate_sectors():
    """Populate the asset_metadata table with sector information"""

    # List of symbols to process (from watchlists)
    symbols = [
        'AAPL', 'ABBV', 'AMZN', 'AVGO', 'BAC', 'CAT', 'COP', 'COST', 'CVNA', 'CVX',
        'DE', 'EXP', 'GE', 'GOOG', 'GS', 'HD', 'HWM', 'JNJ', 'JPM', 'LLY',
        'MA', 'MSFT', 'NVDA', 'OXY', 'PFE', 'PLTR', 'ROKU', 'SLB', 'TPR', 'TSLA',
        'UNH', 'V', 'XOM'
    ]

    # Create database engine and session
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Create tables if they don't exist
        Base.metadata.create_all(engine)

        print(f"Starting sector population for {len(symbols)} symbols...")

        success_count = 0
        error_count = 0

        for i, symbol in enumerate(symbols, 1):
            print(f"[{i}/{len(symbols)}] Processing {symbol}...")

            # Check if we already have data for this symbol
            existing = session.query(AssetMetadata).filter_by(symbol=symbol, country='us').first()

            if existing and existing.sector:
                print(f"  [OK] {symbol} already has sector data: {existing.sector}")
                success_count += 1
                continue

            # Get company information from Finnhub
            company_info = get_company_info(symbol)

            if company_info:
                # Create or update the asset metadata
                if existing:
                    # Update existing record
                    existing.name = company_info.get('name')
                    existing.sector = company_info.get('sector')
                    existing.exchange = company_info.get('exchange')
                    existing.currency = company_info.get('currency')
                    existing.updated_at = datetime.now(timezone.utc)
                    print(f"  [OK] Updated {symbol}: {company_info.get('sector')}")
                else:
                    # Create new record
                    metadata = AssetMetadata(
                        symbol=symbol,
                        country=company_info.get('country', 'us'),
                        asset_type='stock',  # Assuming stocks for now
                        exchange=company_info.get('exchange'),
                        name=company_info.get('name'),
                        sector=company_info.get('sector'),
                        currency=company_info.get('currency'),
                        created_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc)
                    )
                    session.add(metadata)
                    print(f"  [OK] Created {symbol}: {company_info.get('sector')}")

                session.commit()
                success_count += 1
            else:
                print(f"  [ERROR] Failed to get data for {symbol}")
                error_count += 1

            # Rate limiting - be respectful to Finnhub API
            if i < len(symbols):  # Don't sleep after the last symbol
                time.sleep(1)  # 1 second between requests

        print(f"\n=== Summary ===")
        print(f"Total symbols: {len(symbols)}")
        print(f"Successfully processed: {success_count}")
        print(f"Errors: {error_count}")
        print("Sector population complete!")

    except Exception as e:
        print(f"Fatal error: {e}")
        session.rollback()
        raise
    finally:
        session.close()

if __name__ == "__main__":
    populate_sectors()