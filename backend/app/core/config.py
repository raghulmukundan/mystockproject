import os
from datetime import timezone, timedelta

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./stock_watchlist.db")
NASDAQ_API_KEY = os.getenv("NASDAQ_API_KEY", "")
DEFAULT_TIMEZONE = timezone(timedelta(hours=-6))  # America/Chicago