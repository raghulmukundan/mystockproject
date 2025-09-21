from contextlib import asynccontextmanager
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.watchlists import router as watchlists_router
from app.api.stocks import router as stocks_router
# Removed Finnhub market router - using Schwab price history instead
from app.api.alerts import router as alerts_router
from app.api.rss_feed import router as rss_router
from app.api.universe import router as universe_router
from app.api.oauth import router as oauth_router
from app.api.price_history import router as price_history_router
from app.api.prices import router as prices_router
from src.api.import_api import router as import_router
from src.api.prices_browser import router as prices_browser_router
# from src.api.tech import router as tech_router  # Temporarily disabled due to NumPy compatibility issue
from app.api.eod_scan import router as eod_scan_router
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    
    # Temporarily disable universe auto-population to allow clean startup
    print("Universe auto-population disabled - database startup successful")
    
    yield

app = FastAPI(title="Stock Watchlist API", version="1.0.0", lifespan=lifespan)

# Optionally reduce access log noise
if os.getenv("UVICORN_ACCESS_LOG", "false").lower() in ("0", "false", "no"): 
    logging.getLogger("uvicorn.access").disabled = True
if os.getenv("UVICORN_LOG_LEVEL", "info").lower() in ("warning", "error", "critical"):
    logging.getLogger("uvicorn").setLevel(os.getenv("UVICORN_LOG_LEVEL", "info").upper())

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(watchlists_router, prefix="/api")
app.include_router(stocks_router, prefix="/api")
# Removed market_router - using Schwab /api/prices/history endpoints instead
app.include_router(alerts_router, prefix="/api/alerts")
app.include_router(rss_router, prefix="/api")
app.include_router(universe_router, prefix="/api")
app.include_router(oauth_router)
# Also expose OAuth routes under /api for frontend proxy convenience
app.include_router(oauth_router, prefix="/api")
app.include_router(price_history_router, prefix="/api")
app.include_router(import_router)
app.include_router(prices_browser_router)
app.include_router(prices_router, prefix="/api/prices")
# app.include_router(tech_router)  # Temporarily disabled due to NumPy compatibility issue
app.include_router(eod_scan_router)

@app.get("/")
async def root():
    return {"message": "Stock Watchlist API"}
