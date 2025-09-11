import asyncio
import pandas as pd
from typing import Dict, List
from datetime import datetime, timedelta
from app.core.config import DEFAULT_TIMEZONE
from app.services.stock_data import stock_data_service

def get_stock_data(symbol: str, period: str = "1mo") -> Dict:
    """Get stock data using the new StockDataService"""
    try:
        # Since this is a sync function but our service is async, we need to run in event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            stock_price = loop.run_until_complete(stock_data_service.get_stock_price(symbol))
        finally:
            loop.close()
        
        if not stock_price:
            return None
            
        return {
            "symbol": stock_price.symbol,
            "price": stock_price.current_price,
            "open": stock_price.current_price,  # Finnhub doesn't provide OHLC in quote endpoint
            "high": stock_price.current_price,
            "low": stock_price.current_price,
            "volume": stock_price.volume or 0,
            "timestamp": stock_price.last_updated or datetime.now(DEFAULT_TIMEZONE)
        }
    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}")
        return None

def get_multiple_stocks_data(symbols: List[str]) -> Dict[str, Dict]:
    """Get data for multiple stocks"""
    data = {}
    for symbol in symbols:
        stock_data = get_stock_data(symbol)
        if stock_data:
            data[symbol] = stock_data
    return data

def _is_market_open(now: datetime | None = None) -> bool:
    """Return True if within market hours (8:30–15:00 America/Chicago, Mon–Fri)."""
    now = now or datetime.now(DEFAULT_TIMEZONE)
    # Convert to America/Chicago offset (DEFAULT_TIMEZONE)
    local = now.astimezone(DEFAULT_TIMEZONE)
    # 0=Mon ... 6=Sun; market open Mon–Fri
    if local.weekday() >= 5:
        return False
    minutes = local.hour * 60 + local.minute
    return (8 * 60 + 30) <= minutes < (15 * 60)


def update_market_data():
    """Update market data; skip when market is closed."""
    now = datetime.now(DEFAULT_TIMEZONE)
    if not _is_market_open(now):
        print(f"Market closed — skipping update at {now.isoformat()}")
        return
    print(f"Updating market data at {now.isoformat()}")
    # TODO: Fetch and cache prices for active watchlist symbols

def get_historical_data(symbol: str, days: int = 30) -> pd.DataFrame:
    """Get historical data - returns empty DataFrame as Finnhub free tier doesn't include historical data"""
    try:
        # For historical data, we would need a premium API or different provider
        # For now, return empty DataFrame to maintain compatibility
        print(f"Historical data not available for {symbol} with current API setup")
        return pd.DataFrame()
    except Exception as e:
        print(f"Error fetching historical data for {symbol}: {e}")
        return pd.DataFrame()
