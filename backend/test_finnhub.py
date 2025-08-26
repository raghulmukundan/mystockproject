import asyncio
import os
import sys

async def test_finnhub_api(api_key=None):
    # Import after potentially modifying the environment
    try:
        if api_key:
            # Set the API key in the environment
            os.environ['FINNHUB_API_KEY'] = api_key
            print(f"Using provided API key: {api_key[:5]}...")
        else:
            # Check if an API key is set in the environment
            api_key = os.getenv('FINNHUB_API_KEY')
            if not api_key:
                print("ERROR: No Finnhub API key found in environment. Please provide a valid API key.")
                print("Usage: python test_finnhub.py YOUR_API_KEY")
                return
            print(f"Using API key from environment: {api_key[:5]}...")
        
        # Now import the stock_data_service
        from app.services.stock_data import stock_data_service
        
        # Test with a common stock
        symbol = 'AAPL'
        print(f"Fetching data for {symbol}...")
        
        data = await stock_data_service.get_stock_price(symbol)
        
        print(f"\nStock price data for {symbol}:")
        print(f"Current price: ${data.current_price}")
        print(f"Change: ${data.change} ({data.change_percent}%)")
        print(f"52-week high: ${data.high_52w or 'Not available'}")
        print(f"52-week low: ${data.low_52w or 'Not available'}")
        print(f"Weekly change: {data.change_week or 'Not available'}%")
        print(f"Monthly change: {data.change_month or 'Not available'}%")
        
        print("\nTest completed successfully - using real Finnhub API data")
        
    except ValueError as e:
        print(f"API key error: {str(e)}")
    except Exception as e:
        print(f"Error fetching data: {str(e)}")

if __name__ == "__main__":
    # Get API key from command line if provided
    api_key = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(test_finnhub_api(api_key))