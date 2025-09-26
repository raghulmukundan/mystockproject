#!/usr/bin/env python3
"""
Update existing watchlist items with missing sector information
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.watchlist_item import WatchlistItem
from app.models.symbol import Symbol

# Basic sector mapping for common stocks
SECTOR_MAPPING = {
    'AAPL': 'Information Technology', 'MSFT': 'Information Technology', 'GOOGL': 'Information Technology',
    'GOOG': 'Information Technology', 'AMZN': 'Consumer Discretionary', 'NVDA': 'Information Technology',
    'TSLA': 'Consumer Discretionary', 'META': 'Information Technology', 'TWLO': 'Information Technology',
    'AMD': 'Information Technology', 'INTC': 'Information Technology', 'CRM': 'Information Technology',
    'NFLX': 'Communication Services', 'JPM': 'Financials', 'BAC': 'Financials', 'V': 'Financials',
    'MA': 'Financials', 'GS': 'Financials', 'WFC': 'Financials', 'MS': 'Financials',
    'JNJ': 'Healthcare', 'PFE': 'Healthcare', 'UNH': 'Healthcare', 'LLY': 'Healthcare', 'ABBV': 'Healthcare',
    'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy', 'OXY': 'Energy',
    'CAT': 'Industrials', 'GE': 'Industrials', 'DE': 'Industrials', 'HWM': 'Industrials', 'EXP': 'Industrials',
    'HD': 'Consumer Discretionary', 'COST': 'Consumer Discretionary', 'TPR': 'Consumer Discretionary',
    'LULU': 'Consumer Discretionary'
}

def update_missing_sectors():
    """Update watchlist items that are missing sector/company information"""
    db = SessionLocal()
    try:
        # Find items missing sector or company_name
        items_to_update = db.query(WatchlistItem).filter(
            (WatchlistItem.sector.is_(None)) | (WatchlistItem.company_name.is_(None))
        ).all()

        updated_count = 0

        for item in items_to_update:
            updated = False

            # Update sector if missing and we have mapping
            if not item.sector and item.symbol in SECTOR_MAPPING:
                item.sector = SECTOR_MAPPING[item.symbol]
                updated = True
                print(f"Updated sector for {item.symbol}: {item.sector}")

            # Update company_name if missing and we have universe data
            if not item.company_name:
                try:
                    universe_symbol = db.query(Symbol).filter(
                        Symbol.symbol == item.symbol
                    ).first()
                    if universe_symbol:
                        item.company_name = universe_symbol.security_name
                        updated = True
                        print(f"Updated company_name for {item.symbol}: {item.company_name}")
                except Exception as e:
                    print(f"Could not update company_name for {item.symbol}: {str(e)}")

            if updated:
                updated_count += 1

        if updated_count > 0:
            db.commit()
            print(f"Successfully updated {updated_count} watchlist items")
        else:
            print("No items needed updating")

    except Exception as e:
        db.rollback()
        print(f"Error updating sectors: {str(e)}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    update_missing_sectors()