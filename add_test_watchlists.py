#!/usr/bin/env python3
"""
Add test watchlists to see how the scrolling sidebar works
"""
import requests
import json

API_BASE = "http://localhost:8000"

test_watchlists = [
    {"name": "Tech Giants", "description": "Large cap technology companies"},
    {"name": "Growth Stocks", "description": "High growth potential stocks"},
    {"name": "Dividend Champions", "description": "Consistent dividend paying stocks"},
    {"name": "Small Cap Gems", "description": "Small cap value opportunities"},
    {"name": "Energy Sector", "description": "Oil, gas and renewable energy"},
    {"name": "Healthcare Leaders", "description": "Pharma and biotech companies"},
    {"name": "Financial Services", "description": "Banks and financial institutions"},
    {"name": "Consumer Brands", "description": "Strong consumer facing companies"},
    {"name": "Real Estate", "description": "REITs and property companies"},
    {"name": "Emerging Markets", "description": "International growth opportunities"},
    {"name": "ESG Focused", "description": "Environmental and sustainable companies"},
    {"name": "Value Picks", "description": "Undervalued stock opportunities"}
]

def create_test_watchlists():
    """Create test watchlists"""
    created_count = 0

    for watchlist_data in test_watchlists:
        try:
            response = requests.post(
                f"{API_BASE}/api/watchlists",
                json=watchlist_data,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code in [200, 201]:
                result = response.json()
                print(f"Created watchlist: {watchlist_data['name']} (ID: {result['id']})")
                created_count += 1
            else:
                print(f"Failed to create {watchlist_data['name']}: {response.status_code} - {response.text}")

        except Exception as e:
            print(f"Error creating {watchlist_data['name']}: {str(e)}")

    print(f"\nSuccessfully created {created_count} test watchlists!")
    print(f"Now you can test the scrolling sidebar with {created_count} watchlists.")

if __name__ == "__main__":
    print("Creating test watchlists for scrolling sidebar...")
    create_test_watchlists()