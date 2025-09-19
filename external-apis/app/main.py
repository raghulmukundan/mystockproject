from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
    return {"service": "external-apis", "status": "running", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8003,
        reload=True
    )