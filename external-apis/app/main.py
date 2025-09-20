from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(
    title="External APIs Service",
    description="Centralized service for external API integrations (Schwab, Finnhub)",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import API routers
from .api import schwab, finnhub

# Register API routes
app.include_router(schwab.router, prefix="/schwab", tags=["schwab"])
app.include_router(finnhub.router, prefix="/finnhub", tags=["finnhub"])

@app.get("/")
async def root():
    return {
        "service": "external-apis", 
        "status": "running", 
        "version": "1.0.0",
        "endpoints": {
            "api_docs": "/docs",
            "api_tester": "/tester",
            "health": "/health",
            "schwab": "/schwab/*",
            "finnhub": "/finnhub/*"
        }
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/tester")
async def api_tester():
    """Serve the API testing UI"""
    return FileResponse("app/static/api-tester.html")

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8003,
        reload=True
    )