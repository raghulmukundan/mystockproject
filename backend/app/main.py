from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.watchlists import router as watchlists_router
from app.core.database import init_db
from app.core.scheduler import scheduler

app = FastAPI(title="Stock Watchlist API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(watchlists_router, prefix="/api")

@app.on_event("startup")
async def startup_event():
    init_db()
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()

@app.get("/")
async def root():
    return {"message": "Stock Watchlist API"}