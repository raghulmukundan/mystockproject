from contextlib import asynccontextmanager
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
from app.core.database import init_db
from app.core.scheduler import scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    
    # Auto-populate universe data on startup (ONLY real data)
    try:
        from app.services.universe.service import UniverseService
        universe_service = UniverseService()
        
        # Check if data already exists
        stats = universe_service.get_stats()
        if stats['count'] == 0:
            print("Universe data not found. Downloading real NASDAQ data...")
            result = universe_service.refresh_symbols(download=True)  # Only real data
            print(f"Universe auto-populated with real data: {result}")
        else:
            print(f"Universe data already exists: {stats['count']} symbols")
    except Exception as e:
        print(f"ERROR: Failed to auto-populate universe data with real NASDAQ data: {e}")
        print("Universe will remain empty until real data can be downloaded.")
    
    # Start price cache background refresh
    try:
        from app.services.price_cache_service import price_cache_service
        price_cache_service.start_background_refresh()
        print("Started price cache background refresh service")
    except Exception as e:
        print(f"Failed to start price cache service: {e}")
    
    scheduler.start()
    yield
    
    # Shutdown
    try:
        from app.services.price_cache_service import price_cache_service
        price_cache_service.stop_background_refresh()
        print("Stopped price cache background refresh service")
    except Exception as e:
        print(f"Error stopping price cache service: {e}")
        
    scheduler.shutdown()

app = FastAPI(title="Stock Watchlist API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
app.include_router(price_history_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Stock Watchlist API"}