import os
from datetime import timezone, timedelta
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/stock_watchlist.db")
NASDAQ_API_KEY = os.getenv("NASDAQ_API_KEY", "")
DEFAULT_TIMEZONE = timezone(timedelta(hours=-6))  # America/Chicago
TIMEZONE = os.getenv("TIMEZONE", "America/Chicago")
DATA_DIR = os.getenv("DATA_DIR", "./data")
UNIVERSE_FILE = os.getenv("UNIVERSE_FILE", "nasdaqtraded.txt")

# Price caching configuration
PRICE_CACHE_TTL_MINUTES = int(os.getenv("PRICE_CACHE_TTL_MINUTES", "30"))  # 30 minutes default
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "demo")