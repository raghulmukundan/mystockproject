"""
Daily Movers API endpoints
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
from src.db.models import DailyMover
from app.core.database import get_db
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class DailyMoverResponse(BaseModel):
    id: int
    date: str
    symbol: str
    sector: Optional[str] = None
    market_cap_category: Optional[str] = None
    mover_type: str  # 'gainer' or 'loser'
    rank_in_category: int

    # Price movement data
    open_price: float
    close_price: float
    high_price: float
    low_price: float
    price_change: float
    price_change_percent: float
    volume: int

    # Additional information
    market_cap: Optional[float] = None
    week_52_high: Optional[float] = None
    week_52_low: Optional[float] = None
    distance_to_52w_high: Optional[float] = None
    distance_to_52w_low: Optional[float] = None
    rsi: Optional[float] = None
    relative_volume: Optional[float] = None

class MoversGroupResponse(BaseModel):
    category: str
    category_type: str  # 'sector' or 'market_cap'
    gainers: List[DailyMoverResponse]
    losers: List[DailyMoverResponse]

class DailyMoversResponse(BaseModel):
    date: str
    sectors: List[MoversGroupResponse]
    market_caps: List[MoversGroupResponse]
    total_movers: int

@router.get("/daily-movers/raw/{date}")
async def get_raw_daily_movers(date: str, db: Session = Depends(get_db)):
    """Get raw daily movers data for debugging"""
    try:
        movers = db.query(DailyMover).filter(DailyMover.date == date).all()

        gainers = [m for m in movers if m.mover_type == 'gainer']
        losers = [m for m in movers if m.mover_type == 'loser']

        return {
            "date": date,
            "total_movers": len(movers),
            "total_gainers": len(gainers),
            "total_losers": len(losers),
            "sample_data": [
                {
                    "symbol": m.symbol,
                    "mover_type": m.mover_type,
                    "sector": m.sector,
                    "market_cap_category": m.market_cap_category,
                    "price_change_percent": m.price_change_percent
                } for m in movers[:5]
            ]
        }
    except Exception as e:
        logger.error(f"Error getting raw movers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/daily-movers/stats")
async def get_movers_stats(db: Session = Depends(get_db)):
    """Get statistics about daily movers data"""
    try:
        from sqlalchemy import func

        # Get total count
        total_movers = db.query(func.count(DailyMover.id)).scalar()

        # Get date range
        date_range = db.query(
            func.min(DailyMover.date).label('earliest'),
            func.max(DailyMover.date).label('latest')
        ).first()

        # Get sector counts
        sector_counts = db.query(
            DailyMover.sector,
            func.count(DailyMover.id).label('count')
        ).filter(DailyMover.sector.isnot(None)).group_by(DailyMover.sector).all()

        # Get market cap counts
        market_cap_counts = db.query(
            DailyMover.market_cap_category,
            func.count(DailyMover.id).label('count')
        ).filter(DailyMover.market_cap_category.isnot(None)).group_by(DailyMover.market_cap_category).all()

        return {
            "total_movers": total_movers,
            "date_range": {
                "earliest": date_range.earliest if date_range else None,
                "latest": date_range.latest if date_range else None
            },
            "sectors": {sector: count for sector, count in sector_counts},
            "market_cap_categories": {cap: count for cap, count in market_cap_counts}
        }

    except Exception as e:
        logger.error(f"Error getting movers stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving stats: {str(e)}")

@router.get("/daily-movers/available-dates")
async def get_available_dates(db: Session = Depends(get_db)):
    """Get list of dates with available movers data"""
    try:
        dates = db.query(DailyMover.date).distinct().order_by(desc(DailyMover.date)).all()

        return {
            "available_dates": [date[0] for date in dates],
            "total_dates": len(dates)
        }

    except Exception as e:
        logger.error(f"Error getting available dates: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving available dates: {str(e)}")

@router.get("/daily-movers/latest", response_model=DailyMoversResponse)
async def get_latest_daily_movers(db: Session = Depends(get_db)):
    """Get the latest daily movers organized by sector and market cap"""
    try:
        # Get the latest date with movers data
        latest_date_result = db.query(DailyMover.date).order_by(desc(DailyMover.date)).first()

        if not latest_date_result:
            raise HTTPException(status_code=404, detail="No daily movers data found")

        latest_date = latest_date_result[0]

        # Get all movers for the latest date
        movers = db.query(DailyMover).filter(DailyMover.date == latest_date).all()

        if not movers:
            raise HTTPException(status_code=404, detail=f"No movers data found for {latest_date}")

        # Group by sectors
        sectors_data = {}
        market_caps_data = {}

        for mover in movers:
            mover_response = DailyMoverResponse(
                id=mover.id,
                date=mover.date,
                symbol=mover.symbol,
                sector=mover.sector,
                market_cap_category=mover.market_cap_category,
                mover_type=mover.mover_type,
                rank_in_category=mover.rank_in_category,
                open_price=mover.open_price,
                close_price=mover.close_price,
                high_price=mover.high_price,
                low_price=mover.low_price,
                price_change=mover.price_change,
                price_change_percent=mover.price_change_percent,
                volume=mover.volume,
                market_cap=mover.market_cap,
                week_52_high=mover.week_52_high,
                week_52_low=mover.week_52_low,
                distance_to_52w_high=mover.distance_to_52w_high,
                distance_to_52w_low=mover.distance_to_52w_low,
                rsi=mover.rsi,
                relative_volume=mover.relative_volume
            )

            # Group by sector
            if mover.sector:
                if mover.sector not in sectors_data:
                    sectors_data[mover.sector] = {"gainers": [], "losers": []}

                if mover.mover_type == "gainer":
                    sectors_data[mover.sector]["gainers"].append(mover_response)
                else:
                    sectors_data[mover.sector]["losers"].append(mover_response)

            # Group by market cap
            if mover.market_cap_category:
                if mover.market_cap_category not in market_caps_data:
                    market_caps_data[mover.market_cap_category] = {"gainers": [], "losers": []}

                if mover.mover_type == "gainer":
                    market_caps_data[mover.market_cap_category]["gainers"].append(mover_response)
                else:
                    market_caps_data[mover.market_cap_category]["losers"].append(mover_response)

        # Sort within each group by rank
        for sector_data in sectors_data.values():
            sector_data["gainers"].sort(key=lambda x: x.rank_in_category)
            sector_data["losers"].sort(key=lambda x: x.rank_in_category)

        for cap_data in market_caps_data.values():
            cap_data["gainers"].sort(key=lambda x: x.rank_in_category)
            cap_data["losers"].sort(key=lambda x: x.rank_in_category)

        # Convert to response format
        sectors = [
            MoversGroupResponse(
                category=sector,
                category_type="sector",
                gainers=data["gainers"],
                losers=data["losers"]
            )
            for sector, data in sectors_data.items()
        ]

        market_caps = [
            MoversGroupResponse(
                category=cap,
                category_type="market_cap",
                gainers=data["gainers"],
                losers=data["losers"]
            )
            for cap, data in market_caps_data.items()
        ]

        # Sort sectors and market caps by name
        sectors.sort(key=lambda x: x.category)
        market_caps.sort(key=lambda x: x.category)

        return DailyMoversResponse(
            date=latest_date,
            sectors=sectors,
            market_caps=market_caps,
            total_movers=len(movers)
        )

    except Exception as e:
        logger.error(f"Error getting daily movers: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving daily movers: {str(e)}")

@router.get("/daily-movers/{date}", response_model=DailyMoversResponse)
async def get_daily_movers_by_date(
    date: str,
    db: Session = Depends(get_db)
):
    """Get daily movers for a specific date"""
    try:
        # Validate date format
        try:
            datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # Get all movers for the specified date
        movers = db.query(DailyMover).filter(DailyMover.date == date).all()

        if not movers:
            raise HTTPException(status_code=404, detail=f"No movers data found for {date}")

        # Group by sectors and market caps (same logic as latest endpoint)
        sectors_data = {}
        market_caps_data = {}

        for mover in movers:
            mover_response = DailyMoverResponse(
                id=mover.id,
                date=mover.date,
                symbol=mover.symbol,
                sector=mover.sector,
                market_cap_category=mover.market_cap_category,
                mover_type=mover.mover_type,
                rank_in_category=mover.rank_in_category,
                open_price=mover.open_price,
                close_price=mover.close_price,
                high_price=mover.high_price,
                low_price=mover.low_price,
                price_change=mover.price_change,
                price_change_percent=mover.price_change_percent,
                volume=mover.volume,
                market_cap=mover.market_cap,
                week_52_high=mover.week_52_high,
                week_52_low=mover.week_52_low,
                distance_to_52w_high=mover.distance_to_52w_high,
                distance_to_52w_low=mover.distance_to_52w_low,
                rsi=mover.rsi,
                relative_volume=mover.relative_volume
            )

            # Group by sector
            if mover.sector:
                if mover.sector not in sectors_data:
                    sectors_data[mover.sector] = {"gainers": [], "losers": []}

                if mover.mover_type == "gainer":
                    sectors_data[mover.sector]["gainers"].append(mover_response)
                else:
                    sectors_data[mover.sector]["losers"].append(mover_response)

            # Group by market cap
            if mover.market_cap_category:
                if mover.market_cap_category not in market_caps_data:
                    market_caps_data[mover.market_cap_category] = {"gainers": [], "losers": []}

                if mover.mover_type == "gainer":
                    market_caps_data[mover.market_cap_category]["gainers"].append(mover_response)
                else:
                    market_caps_data[mover.market_cap_category]["losers"].append(mover_response)

        # Sort and convert to response format
        sectors = [
            MoversGroupResponse(
                category=sector,
                category_type="sector",
                gainers=sorted(data["gainers"], key=lambda x: x.rank_in_category),
                losers=sorted(data["losers"], key=lambda x: x.rank_in_category)
            )
            for sector, data in sectors_data.items()
        ]

        market_caps = [
            MoversGroupResponse(
                category=cap,
                category_type="market_cap",
                gainers=sorted(data["gainers"], key=lambda x: x.rank_in_category),
                losers=sorted(data["losers"], key=lambda x: x.rank_in_category)
            )
            for cap, data in market_caps_data.items()
        ]

        sectors.sort(key=lambda x: x.category)
        market_caps.sort(key=lambda x: x.category)

        return DailyMoversResponse(
            date=date,
            sectors=sectors,
            market_caps=market_caps,
            total_movers=len(movers)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting daily movers for {date}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving daily movers: {str(e)}")

@router.get("/daily-movers/sector/{sector}")
async def get_movers_by_sector(
    sector: str,
    days: int = Query(7, ge=1, le=30, description="Number of days to include"),
    db: Session = Depends(get_db)
):
    """Get movers for a specific sector over the last N days"""
    try:
        # Calculate date range
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days-1)

        # Get movers for the sector in the date range
        movers = db.query(DailyMover).filter(
            and_(
                DailyMover.sector == sector,
                DailyMover.date >= start_date.strftime('%Y-%m-%d'),
                DailyMover.date <= end_date.strftime('%Y-%m-%d')
            )
        ).order_by(desc(DailyMover.date), DailyMover.rank_in_category).all()

        if not movers:
            raise HTTPException(status_code=404, detail=f"No movers data found for sector {sector}")

        # Group by date
        dates_data = {}
        for mover in movers:
            if mover.date not in dates_data:
                dates_data[mover.date] = {"gainers": [], "losers": []}

            mover_response = DailyMoverResponse(
                id=mover.id,
                date=mover.date,
                symbol=mover.symbol,
                sector=mover.sector,
                market_cap_category=mover.market_cap_category,
                mover_type=mover.mover_type,
                rank_in_category=mover.rank_in_category,
                open_price=mover.open_price,
                close_price=mover.close_price,
                high_price=mover.high_price,
                low_price=mover.low_price,
                price_change=mover.price_change,
                price_change_percent=mover.price_change_percent,
                volume=mover.volume,
                market_cap=mover.market_cap,
                week_52_high=mover.week_52_high,
                week_52_low=mover.week_52_low,
                distance_to_52w_high=mover.distance_to_52w_high,
                distance_to_52w_low=mover.distance_to_52w_low,
                rsi=mover.rsi,
                relative_volume=mover.relative_volume
            )

            if mover.mover_type == "gainer":
                dates_data[mover.date]["gainers"].append(mover_response)
            else:
                dates_data[mover.date]["losers"].append(mover_response)

        return {
            "sector": sector,
            "date_range": {
                "start": start_date.strftime('%Y-%m-%d'),
                "end": end_date.strftime('%Y-%m-%d')
            },
            "dates": dates_data
        }

    except Exception as e:
        logger.error(f"Error getting movers for sector {sector}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving sector movers: {str(e)}")

# Duplicate endpoint removed - available-dates endpoint is defined above

