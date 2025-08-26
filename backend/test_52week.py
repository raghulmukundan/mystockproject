import asyncio
import os
import sys
import json
import dotenv

async def test_52week_data(api_key=None, symbol="AAPL"):
    """Test that we're correctly retrieving 52-week high/low data from Finnhub"""
    try:
        # Load environment variables from .env file
        dotenv.load_dotenv()
        
        # Always print the current directory to debug path issues
        print(f"Current directory: {os.getcwd()}")
        
        if api_key:
            # Use provided API key
            print(f"Using provided API key: {api_key[:5]}...")
        else:
            # Check if an API key is set in the environment
            api_key = os.getenv('FINNHUB_API_KEY')
            if not api_key:
                print("ERROR: No Finnhub API key found in environment. Please provide a valid API key.")
                print("Usage: python test_52week.py YOUR_API_KEY [SYMBOL]")
                return
            print(f"Using API key from environment: {api_key[:5]}...")
        
        # Test with the provided symbol or default to AAPL
        print(f"Fetching 52-week data for {symbol}...")
        
        # First make a direct API call to check the raw response
        import aiohttp
        
        async with aiohttp.ClientSession() as session:
            # Call the metrics endpoint directly
            metrics_url = f"https://finnhub.io/api/v1/stock/metric"
            metrics_params = {
                'symbol': symbol.upper(),
                'metric': 'all',
                'token': api_key
            }
            
            print("Making direct API call to Finnhub metrics endpoint...")
            async with session.get(metrics_url, params=metrics_params) as metrics_response:
                if metrics_response.status == 200:
                    metrics_data = await metrics_response.json()
                    print("\nRaw API response:")
                    print(json.dumps(metrics_data, indent=2))
                    
                    metrics = metrics_data.get('metric', {})
                    
                    print("\n52-week data in response:")
                    if '52WeekHigh' in metrics:
                        print(f"52WeekHigh: {metrics.get('52WeekHigh')}")
                    else:
                        print("52WeekHigh field not found in response")
                        
                    if '52WeekLow' in metrics:
                        print(f"52WeekLow: {metrics.get('52WeekLow')}")
                    else:
                        print("52WeekLow field not found in response")
                    
                    # Print all available fields related to 52-week or ranges
                    print("\nAll 52-week or range related fields:")
                    for key in sorted(metrics.keys()):
                        if '52' in key or 'week' in key.lower() or 'Week' in key or 'high' in key.lower() or 'low' in key.lower() or 'range' in key.lower():
                            print(f"  {key}: {metrics[key]}")
                else:
                    print(f"Error calling metrics endpoint: {metrics_response.status}")
                    print("This usually means your API key is invalid or you've exceeded your rate limit.")
        
    except Exception as e:
        print(f"Error testing 52-week data: {str(e)}")

if __name__ == "__main__":
    # Get API key and optional symbol from command line
    api_key = sys.argv[1] if len(sys.argv) > 1 else None
    symbol = sys.argv[2] if len(sys.argv) > 2 else "AAPL"
    
    # If no API key is provided as argument, try to load from .env
    if not api_key:
        # Load environment variables from .env file
        dotenv.load_dotenv()
        api_key = os.getenv('FINNHUB_API_KEY')
        
        # If still no API key, then exit
        if not api_key:
            print("Please provide your Finnhub API key as a command line parameter.")
            print("Usage: python test_52week.py YOUR_API_KEY [SYMBOL]")
            sys.exit(1)
        
    asyncio.run(test_52week_data(api_key, symbol))