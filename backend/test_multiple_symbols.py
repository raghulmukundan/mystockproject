import asyncio
import os
import sys
import json
import time
import dotenv
from typing import List, Dict

async def test_multiple_symbols_52week_data(api_key: str = None, symbols: List[str] = None):
    """
    Test 52-week high/low data retrieval from Finnhub API for multiple stock symbols.
    
    Args:
        api_key: Finnhub API key (if not provided, will try to load from .env)
        symbols: List of stock symbols to test (defaults to major tech stocks)
    
    Returns:
        Dict with summary statistics
    """
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
                print("Usage: python test_multiple_symbols.py YOUR_API_KEY")
                return None
            print(f"Using API key from environment: {api_key[:5]}...")
        
        # Default symbols to test if none provided
        if not symbols:
            symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']
        
        print(f"\nTesting 52-week data for {len(symbols)} symbols: {', '.join(symbols)}")
        print("=" * 60)
        
        # Initialize tracking variables
        results = {}
        successful_requests = 0
        symbols_with_52week_data = 0
        
        import aiohttp
        
        async with aiohttp.ClientSession() as session:
            # Process each symbol sequentially to respect rate limits
            for i, symbol in enumerate(symbols):
                print(f"\n[{i+1}/{len(symbols)}] Testing symbol: {symbol}")
                print("-" * 30)
                
                try:
                    # Call the metrics endpoint directly
                    metrics_url = f"https://finnhub.io/api/v1/stock/metric"
                    metrics_params = {
                        'symbol': symbol.upper(),
                        'metric': 'all',
                        'token': api_key
                    }
                    
                    print(f"Making API call for {symbol}...")
                    async with session.get(metrics_url, params=metrics_params) as metrics_response:
                        if metrics_response.status == 200:
                            successful_requests += 1
                            metrics_data = await metrics_response.json()
                            metrics = metrics_data.get('metric', {})
                            
                            # Check for 52-week data
                            has_52week_high = '52WeekHigh' in metrics and metrics.get('52WeekHigh') is not None
                            has_52week_low = '52WeekLow' in metrics and metrics.get('52WeekLow') is not None
                            
                            week_high_val = metrics.get('52WeekHigh', 'Not available')
                            week_low_val = metrics.get('52WeekLow', 'Not available')
                            
                            # Store results
                            results[symbol] = {
                                'status': 'success',
                                '52WeekHigh': week_high_val,
                                '52WeekLow': week_low_val,
                                'has_52week_data': has_52week_high and has_52week_low
                            }
                            
                            if has_52week_high and has_52week_low:
                                symbols_with_52week_data += 1
                                print(f"✓ 52-week data AVAILABLE for {symbol}")
                                print(f"  52WeekHigh: {week_high_val}")
                                print(f"  52WeekLow: {week_low_val}")
                            else:
                                print(f"✗ 52-week data NOT AVAILABLE for {symbol}")
                                if has_52week_high:
                                    print(f"  52WeekHigh: {week_high_val} (available)")
                                else:
                                    print(f"  52WeekHigh: Not found")
                                if has_52week_low:
                                    print(f"  52WeekLow: {week_low_val} (available)")
                                else:
                                    print(f"  52WeekLow: Not found")
                            
                            # Show some additional relevant fields if available
                            relevant_fields = []
                            for key in sorted(metrics.keys()):
                                if any(term in key.lower() for term in ['52', 'week', 'high', 'low', 'range']):
                                    if key not in ['52WeekHigh', '52WeekLow']:
                                        relevant_fields.append(f"{key}: {metrics[key]}")
                            
                            if relevant_fields:
                                print(f"  Other relevant fields: {', '.join(relevant_fields[:3])}")
                                
                        else:
                            print(f"✗ ERROR: API call failed for {symbol} (Status: {metrics_response.status})")
                            if metrics_response.status == 429:
                                print("  Rate limit exceeded - consider increasing delay between requests")
                            elif metrics_response.status == 401:
                                print("  Unauthorized - check your API key")
                            
                            results[symbol] = {
                                'status': 'error',
                                'error_code': metrics_response.status,
                                'has_52week_data': False
                            }
                
                except Exception as e:
                    print(f"✗ EXCEPTION occurred for {symbol}: {str(e)}")
                    results[symbol] = {
                        'status': 'exception',
                        'error': str(e),
                        'has_52week_data': False
                    }
                
                # Add delay between requests to respect rate limits (Finnhub free tier: 60 calls/minute)
                if i < len(symbols) - 1:  # Don't delay after the last symbol
                    print(f"Waiting 1.5 seconds before next request (rate limit protection)...")
                    time.sleep(1.5)
        
        # Print summary
        print("\n" + "=" * 60)
        print("SUMMARY REPORT")
        print("=" * 60)
        print(f"Total symbols tested: {len(symbols)}")
        print(f"Successful API requests: {successful_requests}")
        print(f"Symbols with 52-week data: {symbols_with_52week_data}")
        print(f"Success rate: {(symbols_with_52week_data / len(symbols) * 100):.1f}%")
        
        # Detailed breakdown
        print("\nDetailed Results:")
        for symbol, result in results.items():
            status_icon = "✓" if result.get('has_52week_data') else "✗"
            if result['status'] == 'success':
                print(f"  {status_icon} {symbol}: 52-week data {'available' if result['has_52week_data'] else 'not available'}")
            else:
                print(f"  {status_icon} {symbol}: {result['status']}")
        
        # Return summary for programmatic use
        return {
            'total_symbols': len(symbols),
            'successful_requests': successful_requests,
            'symbols_with_52week_data': symbols_with_52week_data,
            'success_rate': symbols_with_52week_data / len(symbols) * 100,
            'results': results
        }
        
    except Exception as e:
        print(f"Error in test_multiple_symbols_52week_data: {str(e)}")
        return None

if __name__ == "__main__":
    # Parse command line arguments
    api_key = None
    symbols = None
    
    # Check for API key as first argument
    if len(sys.argv) > 1:
        api_key = sys.argv[1]
    
    # Check for custom symbols (space-separated after API key)
    if len(sys.argv) > 2:
        symbols = sys.argv[2:]
    
    # If no API key is provided as argument, try to load from .env
    if not api_key:
        dotenv.load_dotenv()
        api_key = os.getenv('FINNHUB_API_KEY')
        
        # If still no API key, show usage and exit
        if not api_key:
            print("Finnhub API 52-Week Data Test for Multiple Symbols")
            print("=" * 50)
            print("Please provide your Finnhub API key as a command line parameter.")
            print("\nUsage:")
            print("  python test_multiple_symbols.py YOUR_API_KEY")
            print("  python test_multiple_symbols.py YOUR_API_KEY AAPL MSFT GOOGL")
            print("\nDefault symbols tested: AAPL, MSFT, GOOGL, AMZN, TSLA")
            print("\nAlternatively, set FINNHUB_API_KEY in your .env file")
            sys.exit(1)
    
    # Run the test
    print("Starting 52-week data test for multiple symbols...")
    print("This will make sequential API calls with rate limiting delays.")
    
    asyncio.run(test_multiple_symbols_52week_data(api_key, symbols))