"""
Configuration for Jobs Service
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://stockuser:stockpass123@host.docker.internal:5432/stockwatchlist")

# Timezone
TIMEZONE = os.getenv("TIMEZONE", "America/Chicago")

# Backend service for business logic endpoints
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000")

# External APIs service for raw API access  
EXTERNAL_APIS_URL = os.getenv("EXTERNAL_APIS_URL", "http://external-apis:8003")

# Market hours (in local timezone)
MARKET_OPEN_HOUR = int(os.getenv("MARKET_OPEN_HOUR", "9"))
MARKET_CLOSE_HOUR = int(os.getenv("MARKET_CLOSE_HOUR", "16"))

# Job configurations
KEEP_JOB_HISTORY = int(os.getenv("KEEP_JOB_HISTORY", "5"))
TTL_CLEANUP_DAYS = int(os.getenv("TTL_CLEANUP_DAYS", "30"))