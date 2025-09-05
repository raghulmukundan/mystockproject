from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.universe import router as universe_router
from src.api.universe_query import router as universe_query_router
from src.services.scheduler import startup_scheduler, shutdown_scheduler
from src.db.models import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting up universe management system...")
    init_db()
    startup_scheduler()
    print("Universe management system started successfully")
    yield
    # Shutdown
    print("Shutting down universe management system...")
    shutdown_scheduler()
    print("Universe management system shutdown completed")

app = FastAPI(
    title="Universe Management API", 
    version="1.0.0", 
    lifespan=lifespan,
    description="API for managing stock universe data from NASDAQ"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Common frontend ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include universe API routers
app.include_router(universe_router)
app.include_router(universe_query_router)

@app.get("/")
async def root():
    return {"message": "Universe Management API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "universe-api"}