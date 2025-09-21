"""
Jobs Service - Handles all scheduled jobs and batch processing
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api import jobs
from app.core.scheduler import scheduler
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    logger.info("Starting Jobs Service...")
    
    # Start the scheduler
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Jobs Service...")
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")

app = FastAPI(
    title="Jobs Service",
    description="Scheduled jobs and batch processing service",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(jobs.router, prefix="/api", tags=["jobs"])

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "jobs-service",
        "scheduler_running": scheduler.running if scheduler else False
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "jobs-service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "jobs": "/api/jobs",
            "job_status": "/api/jobs/{job_name}/status",
            "run_job": "/api/jobs/{job_name}/run"
        }
    }