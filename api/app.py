#!/usr/bin/env python3
"""
Screener API
FastAPI endpoint for stock screener with comprehensive filtering and pagination.

Schedule: On-demand (stateless query over screener_latest view)
Filters: price, volume, signals, trend scores, weekly/daily alignment
Sorting: whitelisted columns with DESC/ASC support
Pagination: page/pageSize with configurable defaults

Example Queries:

# Basic: Top combined scores
curl "http://localhost:8000/api/screener?sort=combined_score&page=1&pageSize=20"

# Breakouts above 200 SMA with volume
curl "http://localhost:8000/api/screener?aboveSMA200=true&donchBreakout=true&minAvgVol20=500000&sort=trend_score_d"

# Weekly strong + daily alignment
curl "http://localhost:8000/api/screener?weeklyStrong=true&smaBullStack=true&minTrendScoreD=30&sort=combined_score"

# Price range + near 52w high
curl "http://localhost:8000/api/screener?minPrice=10&maxPrice=100&maxDistanceTo52wHigh=-0.05&minRelVolume=1.5"

# MACD cross with high scores
curl "http://localhost:8000/api/screener?macdCrossUp=true&minTrendScoreW=40&sort=risk_reward_ratio"

UI Chip Mapping:
- "Above 200 SMA" → aboveSMA200=true
- "SMA Bull Stack" → smaBullStack=true (sma20 > sma50 > sma200)
- "MACD Cross ↑" → macdCrossUp=true
- "Donchian Breakout" → donchBreakout=true
- "Weekly Strong" → weeklyStrong=true (close_above_30w AND stack_10_30_40)
- "High Daily Score" → minTrendScoreD=40
- "High Weekly Score" → minTrendScoreW=50
- "Near 52w High" → maxDistanceTo52wHigh=-0.05

Environment:
    DB_DSN: PostgreSQL connection string
    SCREENER_DEFAULT_SORT: combined_score DESC, trend_score_w DESC (default)
    SCREENER_PAGE_SIZE_DEFAULT: 50 (default)
    SCREENER_MAX_PAGE_SIZE: 200 (max allowed)
"""

import os
import logging
from typing import Optional, List, Dict, Any
from decimal import Decimal
from datetime import date as date_type

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================
DB_DSN = os.getenv('DB_DSN', 'postgresql+psycopg://postgres:postgres123@localhost:5432/mystockproject')
DEFAULT_SORT = os.getenv('SCREENER_DEFAULT_SORT', 'combined_score DESC')
PAGE_SIZE_DEFAULT = int(os.getenv('SCREENER_PAGE_SIZE_DEFAULT', '50'))
MAX_PAGE_SIZE = int(os.getenv('SCREENER_MAX_PAGE_SIZE', '200'))

# Whitelisted sort columns (prevent SQL injection)
ALLOWED_SORT_COLUMNS = {
    'symbol', 'close', 'volume', 'avg_vol20', 'rel_volume',
    'rsi14', 'adx14', 'distance_to_52w_high', 'pct_from_52w_high',
    'trend_score_d', 'trend_score_w', 'combined_score',
    'risk_reward_ratio', 'distance_from_entry_pct',
    'sma20', 'sma50', 'sma200', 'macd', 'macd_hist',
    'daily_date', 'weekly_date',
    'sector', 'market_cap_numeric'
}

# ============================================================================
# Database Setup
# ============================================================================
engine = create_engine(DB_DSN, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(bind=engine)

# ============================================================================
# Pydantic Models
# ============================================================================
class ScreenerResult(BaseModel):
    """Single screener result row"""
    symbol: str
    daily_date: Optional[date_type]
    weekly_date: Optional[date_type]

    # Price and volume
    close: Optional[Decimal]
    volume: Optional[int]
    avg_vol20: Optional[Decimal]
    rel_volume: Optional[Decimal]

    # Daily technicals
    sma20: Optional[Decimal]
    sma50: Optional[Decimal]
    sma200: Optional[Decimal]
    rsi14: Optional[Decimal]
    adx14: Optional[Decimal]
    atr14: Optional[Decimal]
    donch20_high: Optional[Decimal]
    donch20_low: Optional[Decimal]
    macd: Optional[Decimal]
    macd_signal: Optional[Decimal]
    macd_hist: Optional[Decimal]
    high_252: Optional[Decimal]
    distance_to_52w_high: Optional[Decimal]
    sma_slope: Optional[Decimal]

    # Daily signals
    sma20_cross_50_up: Optional[bool]
    price_above_200: Optional[bool]
    rsi_cross_50_up: Optional[bool]
    macd_cross_up: Optional[bool]
    donch20_breakout: Optional[bool]
    high_tight_zone: Optional[bool]
    trend_score_d: Optional[int]

    # Trade levels
    proposed_entry: Optional[Decimal]
    proposed_stop: Optional[Decimal]
    target1: Optional[Decimal]
    target2: Optional[Decimal]
    risk_reward_ratio: Optional[Decimal]
    daily_notes: Optional[str]

    # Weekly technicals
    sma10w: Optional[Decimal]
    sma30w: Optional[Decimal]
    sma40w: Optional[Decimal]
    rsi14w: Optional[Decimal]
    adx14w: Optional[Decimal]
    atr14w: Optional[Decimal]
    donch20w_high: Optional[Decimal]
    donch20w_low: Optional[Decimal]
    macd_w: Optional[Decimal]
    macd_signal_w: Optional[Decimal]
    macd_hist_w: Optional[Decimal]
    avg_vol10w: Optional[Decimal]
    high_52w: Optional[Decimal]
    distance_to_52w_high_w: Optional[Decimal]
    sma_w_slope: Optional[Decimal]

    # Weekly signals
    stack_10_30_40: Optional[bool]
    close_above_30w: Optional[bool]
    donch20w_breakout: Optional[bool]
    macd_w_cross_up: Optional[bool]
    rsi14w_gt_50: Optional[bool]
    trend_score_w: Optional[int]

    # Derived fields
    sma_bull_stack: Optional[bool]
    weekly_strong: Optional[bool]
    combined_score: Optional[int]
    distance_from_entry_pct: Optional[Decimal]
    pct_from_52w_high: Optional[Decimal]

    # Asset metadata
    asset_type: Optional[str]
    sector: Optional[str]
    industry: Optional[str]
    market_cap: Optional[str]
    market_cap_category: Optional[str]
    market_cap_numeric: Optional[int]

    class Config:
        from_attributes = True


class ScreenerResponse(BaseModel):
    """Paginated screener response"""
    results: List[ScreenerResult]
    total_count: int
    page: int
    page_size: int
    total_pages: int


# ============================================================================
# FastAPI App
# ============================================================================
app = FastAPI(
    title="Stock Screener API",
    description="Query stocks with technical indicators, signals, and trade setups",
    version="1.0.0"
)

# CORS middleware (adjust origins for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_sort_param(sort: str) -> str:
    """
    Parse and validate sort parameter.
    Format: "column" or "column DESC" or "column ASC"
    Returns SQL ORDER BY clause or raises HTTPException.
    """
    if not sort or sort.strip() == '':
        return DEFAULT_SORT

    parts = sort.strip().split()

    if len(parts) == 1:
        column = parts[0]
        direction = 'DESC'
    elif len(parts) == 2:
        column, direction = parts
        direction = direction.upper()
        if direction not in ('ASC', 'DESC'):
            raise HTTPException(status_code=400, detail=f"Invalid sort direction: {direction}")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid sort format: {sort}")

    if column not in ALLOWED_SORT_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Invalid sort column: {column}")

    return f"{column} {direction}"


def build_where_clauses(
    min_price: Optional[float],
    max_price: Optional[float],
    min_avg_vol20: Optional[int],
    min_rel_volume: Optional[float],
    max_distance_to_52w_high: Optional[float],
    min_market_cap: Optional[int],
    max_market_cap: Optional[int],
    asset_type: Optional[str],
    above_sma200: Optional[bool],
    sma_bull_stack: Optional[bool],
    macd_cross_up: Optional[bool],
    donch_breakout: Optional[bool],
    weekly_strong: Optional[bool],
    min_trend_score_d: Optional[int],
    min_trend_score_w: Optional[int],
) -> tuple[List[str], Dict[str, Any]]:
    """
    Build WHERE clauses and parameter dict from filters.
    Returns (where_clauses, params)
    """
    where_clauses = []
    params = {}

    # Price filters
    if min_price is not None:
        where_clauses.append("close >= :min_price")
        params['min_price'] = min_price

    if max_price is not None:
        where_clauses.append("close <= :max_price")
        params['max_price'] = max_price

    # Volume filters
    if min_avg_vol20 is not None:
        where_clauses.append("avg_vol20 >= :min_avg_vol20")
        params['min_avg_vol20'] = min_avg_vol20

    if min_rel_volume is not None:
        where_clauses.append("rel_volume >= :min_rel_volume")
        params['min_rel_volume'] = min_rel_volume

    # 52-week high distance filter
    if max_distance_to_52w_high is not None:
        where_clauses.append("distance_to_52w_high >= :max_distance_to_52w_high")
        params['max_distance_to_52w_high'] = max_distance_to_52w_high

    # Market cap filters
    if min_market_cap is not None:
        where_clauses.append("market_cap_numeric >= :min_market_cap")
        params['min_market_cap'] = min_market_cap

    if max_market_cap is not None:
        where_clauses.append("market_cap_numeric <= :max_market_cap")
        params['max_market_cap'] = max_market_cap

    # Asset type filter
    if asset_type is not None:
        where_clauses.append("asset_type = :asset_type")
        params['asset_type'] = asset_type.lower()

    # Boolean signal filters
    if above_sma200 is True:
        where_clauses.append("price_above_200 = TRUE")

    if sma_bull_stack is True:
        where_clauses.append("sma_bull_stack = TRUE")

    if macd_cross_up is True:
        where_clauses.append("macd_cross_up = TRUE")

    if donch_breakout is True:
        where_clauses.append("donch20_breakout = TRUE")

    if weekly_strong is True:
        where_clauses.append("weekly_strong = TRUE")

    # Trend score filters
    if min_trend_score_d is not None:
        where_clauses.append("trend_score_d >= :min_trend_score_d")
        params['min_trend_score_d'] = min_trend_score_d

    if min_trend_score_w is not None:
        where_clauses.append("trend_score_w >= :min_trend_score_w")
        params['min_trend_score_w'] = min_trend_score_w

    return where_clauses, params


@app.get("/api/screener", response_model=ScreenerResponse)
def get_screener(
    # Price filters
    minPrice: Optional[float] = Query(None, description="Minimum close price"),
    maxPrice: Optional[float] = Query(None, description="Maximum close price"),

    # Volume filters
    minAvgVol20: Optional[int] = Query(None, description="Minimum 20-day avg volume"),
    minRelVolume: Optional[float] = Query(None, description="Minimum relative volume"),

    # Position filter
    maxDistanceTo52wHigh: Optional[float] = Query(
        None,
        description="Max distance from 52w high (e.g., -0.05 for within 5%)"
    ),

    # Market cap filters
    minMarketCap: Optional[int] = Query(None, description="Minimum market cap"),
    maxMarketCap: Optional[int] = Query(None, description="Maximum market cap"),

    # Asset type filter
    assetType: Optional[str] = Query(None, description="Filter by asset type (stock, etf)"),

    # Boolean signal filters
    aboveSMA200: Optional[bool] = Query(None, description="Price above 200 SMA"),
    smaBullStack: Optional[bool] = Query(None, description="SMA20 > SMA50 > SMA200"),
    macdCrossUp: Optional[bool] = Query(None, description="MACD cross up signal"),
    donchBreakout: Optional[bool] = Query(None, description="Donchian 20 breakout"),
    weeklyStrong: Optional[bool] = Query(None, description="close_above_30w AND stack_10_30_40"),

    # Score filters
    minTrendScoreD: Optional[int] = Query(None, description="Minimum daily trend score"),
    minTrendScoreW: Optional[int] = Query(None, description="Minimum weekly trend score"),

    # Sorting and pagination
    sort: str = Query(DEFAULT_SORT, description="Sort column (e.g., 'combined_score DESC')"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    pageSize: int = Query(PAGE_SIZE_DEFAULT, ge=1, le=MAX_PAGE_SIZE, description="Results per page"),
) -> ScreenerResponse:
    """
    Query stock screener with filters, sorting, and pagination.

    Returns stocks from screener_latest view with all technical indicators,
    daily/weekly signals, trend scores, and proposed trade setups.
    """
    try:
        # Parse and validate sort
        order_by = parse_sort_param(sort)

        # Build WHERE clauses
        where_clauses, params = build_where_clauses(
            min_price=minPrice,
            max_price=maxPrice,
            min_avg_vol20=minAvgVol20,
            min_rel_volume=minRelVolume,
            max_distance_to_52w_high=maxDistanceTo52wHigh,
            min_market_cap=minMarketCap,
            max_market_cap=maxMarketCap,
            asset_type=assetType,
            above_sma200=aboveSMA200,
            sma_bull_stack=smaBullStack,
            macd_cross_up=macdCrossUp,
            donch_breakout=donchBreakout,
            weekly_strong=weeklyStrong,
            min_trend_score_d=minTrendScoreD,
            min_trend_score_w=minTrendScoreW,
        )

        where_sql = ""
        if where_clauses:
            where_sql = "WHERE " + " AND ".join(where_clauses)

        # Calculate offset
        offset = (page - 1) * pageSize
        params['limit'] = pageSize
        params['offset'] = offset

        # Count query
        count_query = text(f"""
            SELECT COUNT(*) AS total
            FROM screener_latest
            {where_sql}
        """)

        # Data query
        data_query = text(f"""
            SELECT
                symbol, daily_date, weekly_date,
                close, volume, avg_vol20, rel_volume,
                sma20, sma50, sma200, rsi14, adx14, atr14,
                donch20_high, donch20_low,
                macd, macd_signal, macd_hist,
                high_252, distance_to_52w_high, sma_slope,
                sma20_cross_50_up, price_above_200, rsi_cross_50_up,
                macd_cross_up, donch20_breakout, high_tight_zone,
                trend_score_d,
                proposed_entry, proposed_stop, target1, target2,
                risk_reward_ratio, daily_notes,
                sma10w, sma30w, sma40w, rsi14w, adx14w, atr14w,
                donch20w_high, donch20w_low,
                macd_w, macd_signal_w, macd_hist_w,
                avg_vol10w, high_52w, distance_to_52w_high_w, sma_w_slope,
                stack_10_30_40, close_above_30w, donch20w_breakout,
                macd_w_cross_up, rsi14w_gt_50, trend_score_w,
                sma_bull_stack, weekly_strong, combined_score,
                distance_from_entry_pct, pct_from_52w_high,
                asset_type, sector, industry, market_cap, market_cap_category, market_cap_numeric
            FROM screener_latest
            {where_sql}
            ORDER BY {order_by}
            LIMIT :limit OFFSET :offset
        """)

        with SessionLocal() as session:
            # Get total count
            count_result = session.execute(count_query, params).fetchone()
            total_count = count_result.total if count_result else 0

            # Get data
            data_result = session.execute(data_query, params).fetchall()

        # Convert to Pydantic models
        results = []
        for row in data_result:
            results.append(ScreenerResult(
                symbol=row.symbol,
                daily_date=row.daily_date,
                weekly_date=row.weekly_date,
                close=row.close,
                volume=row.volume,
                avg_vol20=row.avg_vol20,
                rel_volume=row.rel_volume,
                sma20=row.sma20,
                sma50=row.sma50,
                sma200=row.sma200,
                rsi14=row.rsi14,
                adx14=row.adx14,
                atr14=row.atr14,
                donch20_high=row.donch20_high,
                donch20_low=row.donch20_low,
                macd=row.macd,
                macd_signal=row.macd_signal,
                macd_hist=row.macd_hist,
                high_252=row.high_252,
                distance_to_52w_high=row.distance_to_52w_high,
                sma_slope=row.sma_slope,
                sma20_cross_50_up=row.sma20_cross_50_up,
                price_above_200=row.price_above_200,
                rsi_cross_50_up=row.rsi_cross_50_up,
                macd_cross_up=row.macd_cross_up,
                donch20_breakout=row.donch20_breakout,
                high_tight_zone=row.high_tight_zone,
                trend_score_d=row.trend_score_d,
                proposed_entry=row.proposed_entry,
                proposed_stop=row.proposed_stop,
                target1=row.target1,
                target2=row.target2,
                risk_reward_ratio=row.risk_reward_ratio,
                daily_notes=row.daily_notes,
                sma10w=row.sma10w,
                sma30w=row.sma30w,
                sma40w=row.sma40w,
                rsi14w=row.rsi14w,
                adx14w=row.adx14w,
                atr14w=row.atr14w,
                donch20w_high=row.donch20w_high,
                donch20w_low=row.donch20w_low,
                macd_w=row.macd_w,
                macd_signal_w=row.macd_signal_w,
                macd_hist_w=row.macd_hist_w,
                avg_vol10w=row.avg_vol10w,
                high_52w=row.high_52w,
                distance_to_52w_high_w=row.distance_to_52w_high_w,
                sma_w_slope=row.sma_w_slope,
                stack_10_30_40=row.stack_10_30_40,
                close_above_30w=row.close_above_30w,
                donch20w_breakout=row.donch20w_breakout,
                macd_w_cross_up=row.macd_w_cross_up,
                rsi14w_gt_50=row.rsi14w_gt_50,
                trend_score_w=row.trend_score_w,
                sma_bull_stack=row.sma_bull_stack,
                weekly_strong=row.weekly_strong,
                combined_score=row.combined_score,
                distance_from_entry_pct=row.distance_from_entry_pct,
                pct_from_52w_high=row.pct_from_52w_high,
                asset_type=row.asset_type,
                sector=row.sector,
                industry=row.industry,
                market_cap=row.market_cap,
                market_cap_category=row.market_cap_category,
                market_cap_numeric=row.market_cap_numeric,
            ))

        # Calculate total pages
        total_pages = (total_count + pageSize - 1) // pageSize if total_count > 0 else 0

        return ScreenerResponse(
            results=results,
            total_count=total_count,
            page=page,
            page_size=pageSize,
            total_pages=total_pages
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Screener query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
