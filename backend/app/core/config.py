import os
from datetime import timezone, timedelta
try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://stockuser:StockPass2024!@host.docker.internal:5432/stockwatchlist")
NASDAQ_API_KEY = os.getenv("NASDAQ_API_KEY", "")
TIMEZONE = os.getenv("TIMEZONE", "America/Chicago")
# Use IANA timezone if available (handles DST), fallback to fixed offset
if ZoneInfo is not None:
    DEFAULT_TIMEZONE = ZoneInfo(TIMEZONE)
else:
    DEFAULT_TIMEZONE = timezone(timedelta(hours=-6))
DATA_DIR = os.getenv("DATA_DIR", "./data")
UNIVERSE_FILE = os.getenv("UNIVERSE_FILE", "nasdaqtraded.txt")

# Price caching configuration
PRICE_CACHE_TTL_MINUTES = int(os.getenv("PRICE_CACHE_TTL_MINUTES", "30"))  # 30 minutes default
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "demo")
