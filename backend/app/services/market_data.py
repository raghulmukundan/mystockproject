import yfinance as yf
import pandas as pd
from typing import Dict, List
from datetime import datetime, timedelta
from app.core.config import DEFAULT_TIMEZONE

def get_stock_data(symbol: str, period: str = "1mo") -> Dict:
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        
        if hist.empty:
            return None
            
        latest = hist.iloc[-1]
        
        return {
            "symbol": symbol,
            "price": float(latest["Close"]),
            "open": float(latest["Open"]),
            "high": float(latest["High"]),
            "low": float(latest["Low"]),
            "volume": int(latest["Volume"]),
            "timestamp": latest.name.to_pydatetime().replace(tzinfo=DEFAULT_TIMEZONE)
        }
    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}")
        return None

def get_multiple_stocks_data(symbols: List[str]) -> Dict[str, Dict]:
    data = {}
    for symbol in symbols:
        stock_data = get_stock_data(symbol)
        if stock_data:
            data[symbol] = stock_data
    return data

def update_market_data():
    print(f"Updating market data at {datetime.now()}")

def get_historical_data(symbol: str, days: int = 30) -> pd.DataFrame:
    try:
        ticker = yf.Ticker(symbol)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        hist = ticker.history(start=start_date, end=end_date)
        return hist
    except Exception as e:
        print(f"Error fetching historical data for {symbol}: {e}")
        return pd.DataFrame()