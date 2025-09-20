"""
Schwab price history provider for external APIs service
"""
import os
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
import pytz
from dotenv import load_dotenv

from ....clients.schwab.client import SchwabHTTPClient
from ....clients.schwab.symbols import to_schwab_symbol

load_dotenv()

@dataclass
class Bar:
    date: str    # YYYY-MM-DD
    open: float
    high: float
    low:  float
    close: float
    volume: int

class ProviderError(Exception):
    def __init__(self, status_code: Optional[int], message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message

class SchwabHistoryProvider:
    """
    Schwab price history provider for daily OHLCV data.
    No mock data - uses real Schwab API.
    """
    
    def __init__(self):
        self.client = SchwabHTTPClient()
        # Use market timezone for US equities to avoid date rollbacks
        # Many providers anchor daily bars to the trading day in US/Eastern
        market_tz = os.getenv("SCHWAB_MARKET_TZ", "America/New_York")
        self.timezone = pytz.timezone(market_tz)
        
    def _timestamp_to_date(self, timestamp_ms: int) -> str:
        """
        Convert timestamp to YYYY-MM-DD date string in configured timezone.
        
        Args:
            timestamp_ms: Timestamp in milliseconds
            
        Returns:
            Date string in YYYY-MM-DD format
        """
        dt = datetime.fromtimestamp(timestamp_ms / 1000.0, tz=pytz.UTC)
        local_dt = dt.astimezone(self.timezone)
        # Return trading date in market timezone (e.g., America/New_York)
        return local_dt.strftime("%Y-%m-%d")
    
    def get_daily_history(self, symbol: str, start: str, end: str) -> List[Bar]:
        """
        Fetch daily OHLCV for [start, end] inclusive (YYYY-MM-DD).
        Uses Schwab price history endpoint. No mock data.
        Must return bars sorted ascending by date.
        
        Args:
            symbol: Stock symbol (e.g., 'AAPL', 'BRK.B')
            start: Start date YYYY-MM-DD
            end: End date YYYY-MM-DD
            
        Returns:
            List of Bar objects sorted by date ascending
            
        Raises:
            Exception: On symbol not found, not entitled, or API errors
        """
        # Convert symbol to Schwab format
        schwab_symbol = to_schwab_symbol(symbol)
        
        # Convert dates to timestamps in market timezone
        start_dt = self.timezone.localize(datetime.strptime(start, "%Y-%m-%d"))
        end_dt = self.timezone.localize(datetime.strptime(end, "%Y-%m-%d").replace(hour=23, minute=59, second=59))
        
        start_timestamp_ms = int(start_dt.timestamp() * 1000)
        end_timestamp_ms = int(end_dt.timestamp() * 1000)
        
        # Build request parameters for daily OHLC data
        # Based on Schwab API schema: periodType=month allows frequencyType=daily
        params = {
            'symbol': schwab_symbol,
            'periodType': 'month',
            'frequencyType': 'daily', 
            'frequency': 1,
            'startDate': start_timestamp_ms,
            'endDate': end_timestamp_ms,
            'needExtendedHoursData': False,
            'needPreviousClose': False
        }
        
        try:
            # Make request to Schwab API - correct endpoint format
            endpoint = f"/marketdata/v1/pricehistory"
            response = self.client.get(endpoint, params=params)
            
            if response.status_code == 404:
                raise ProviderError(404, f"Symbol '{symbol}' not found or not entitled")
            elif response.status_code != 200:
                # Include truncated body for diagnostics
                body = response.text
                if body and len(body) > 500:
                    body = body[:500] + "..."
                raise ProviderError(response.status_code, f"Schwab API error {response.status_code}: {body}")
            
            data = response.json()
            
            # Check if we have candles data
            if 'candles' not in data or not data['candles']:
                # Return empty list for no data (holidays/weekends)
                return []
            
            bars = []
            for candle in data['candles']:
                try:
                    # Convert timestamp to date
                    date_str = self._timestamp_to_date(candle['datetime'])
                    
                    bar = Bar(
                        date=date_str,
                        open=float(candle['open']),
                        high=float(candle['high']),
                        low=float(candle['low']),
                        close=float(candle['close']),
                        volume=int(candle['volume'])
                    )
                    bars.append(bar)
                    
                except (KeyError, ValueError) as e:
                    # Skip malformed candles
                    continue
            
            # Sort by date ascending
            bars.sort(key=lambda x: x.date)
            
            return bars
            
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(None, f"Failed to fetch price history for '{symbol}': {str(e)}")