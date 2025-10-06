"""
Daily movers calculation implementation
"""
import logging
import aiohttp
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres123@postgres:5432/mystockproject')
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

async def run_daily_movers_compute() -> Dict:
    """
    Calculate daily movers by analyzing price movements across sectors and market caps
    """
    logger.info("Starting daily movers computation")

    try:
        # Get the latest trading date
        latest_date = await get_latest_trading_date()
        if not latest_date:
            raise Exception("No trading data available")

        logger.info(f"Computing daily movers for date: {latest_date}")

        # Get ALL stock data with price movements and metadata in one query
        stocks_data = await get_all_stocks_with_movements(latest_date)
        logger.info(f"Found {len(stocks_data)} stocks with price data")

        if not stocks_data:
            raise Exception("No stock movement data available for analysis")

        # Calculate top movers with nested structure (Sector->MarketCap and MarketCap->Sector)
        movers_results = calculate_top_movers_nested(stocks_data)

        # Store results in database
        stored_count = await store_daily_movers(latest_date, movers_results)

        result = {
            'date': latest_date,
            'total_stocks_analyzed': len(stocks_data),
            'total_movers': stored_count,
            'sectors_processed': len(set(stock.get('sector') for stock in stocks_data if stock.get('sector'))),
            'market_cap_categories': len(set(stock.get('market_cap_category') for stock in stocks_data if stock.get('market_cap_category')))
        }

        logger.info(f"Daily movers computation completed: {result}")
        return result

    except Exception as e:
        logger.error(f"Daily movers computation failed: {str(e)}", exc_info=True)
        raise

async def get_latest_trading_date() -> Optional[str]:
    """Get the latest trading date from the database"""
    try:
        with SessionLocal() as db:
            # Try to get from technical_latest first (most reliable)
            result = db.execute(text("""
                SELECT MAX(date) as latest_date
                FROM technical_latest
                WHERE date IS NOT NULL
            """)).fetchone()

            if result and result.latest_date:
                return result.latest_date

            # Fallback to unified price data
            result = db.execute(text("""
                SELECT MAX(date) as latest_date
                FROM unified_price_data
                WHERE date IS NOT NULL
            """)).fetchone()

            return result.latest_date if result else None

    except Exception as e:
        logger.error(f"Error getting latest trading date: {str(e)}")
        raise

async def get_all_stocks_with_movements(date: str) -> List[Dict]:
    """Get ALL stock price movements for the given date (no limit)"""
    try:
        with SessionLocal() as db:
            # Get ALL price data with CORRECT daily percentage change calculation
            # Daily % Change = (Current Close - Previous Close) / Previous Close * 100
            query = text("""
                SELECT
                    upd.symbol,
                    upd.date,
                    upd.open,
                    upd.high,
                    upd.low,
                    upd.close,
                    upd.volume,
                    prev.close as previous_close,
                    upd.close - COALESCE(prev.close, upd.open) AS price_change,
                    CASE
                        WHEN COALESCE(prev.close, upd.open) > 0
                        THEN ((upd.close - COALESCE(prev.close, upd.open)) / COALESCE(prev.close, upd.open)) * 100
                        ELSE 0
                    END AS price_change_percent,
                    am.sector,
                    am.market_cap
                FROM unified_price_data upd
                LEFT JOIN unified_price_data prev ON upd.symbol = prev.symbol
                    AND prev.date = (
                        SELECT MAX(date)
                        FROM unified_price_data prev2
                        WHERE prev2.symbol = upd.symbol
                        AND prev2.date < upd.date
                    )
                LEFT JOIN asset_metadata am ON upd.symbol = am.symbol AND am.country = 'us'
                WHERE upd.date = :date
                AND upd.open > 0
                AND upd.close > 0
                ORDER BY upd.symbol
            """)

            result = db.execute(query, {"date": date}).fetchall()

            stocks = []
            for row in result:
                # Calculate market cap category
                market_cap_category = 'unknown'
                if row.market_cap:
                    try:
                        market_cap_value = float(row.market_cap)
                        market_cap_category = categorize_market_cap(market_cap_value)
                    except (ValueError, TypeError):
                        market_cap_category = 'unknown'

                stocks.append({
                    'symbol': row.symbol,
                    'date': row.date,
                    'open': float(row.open),
                    'high': float(row.high),
                    'low': float(row.low),
                    'close': float(row.close),
                    'volume': int(row.volume),
                    'previous_close': float(row.previous_close) if row.previous_close else None,
                    'price_change': float(row.price_change),
                    'price_change_percent': float(row.price_change_percent),
                    'sector': row.sector or 'Unknown',
                    'market_cap': float(row.market_cap) if row.market_cap else None,
                    'market_cap_category': market_cap_category
                })

            return stocks

    except Exception as e:
        logger.error(f"Error getting stock movements: {str(e)}")
        raise

async def enrich_with_market_cap_categories(stocks: List[Dict]) -> List[Dict]:
    """Enrich stocks with market cap categories from asset_metadata table"""
    try:
        with SessionLocal() as db:
            for stock in stocks:
                # Get market cap from asset_metadata table
                result = db.execute(text("""
                    SELECT market_cap FROM asset_metadata
                    WHERE symbol = :symbol AND country = 'us'
                    LIMIT 1
                """), {"symbol": stock['symbol']}).fetchone()

                if result and result.market_cap:
                    try:
                        market_cap = float(result.market_cap)
                        stock['market_cap'] = market_cap
                        stock['market_cap_category'] = categorize_market_cap(market_cap)
                    except (ValueError, TypeError):
                        stock['market_cap_category'] = 'unknown'
                else:
                    stock['market_cap_category'] = 'unknown'

        return stocks

    except Exception as e:
        logger.error(f"Error enriching with market cap: {str(e)}")
        # Return stocks without market cap info rather than failing
        for stock in stocks:
            if 'market_cap_category' not in stock:
                stock['market_cap_category'] = 'unknown'
        return stocks

def categorize_market_cap(market_cap: float) -> str:
    """Categorize market cap into size buckets"""
    if market_cap >= 200_000_000_000:  # $200B+
        return 'mega'
    elif market_cap >= 10_000_000_000:  # $10B+
        return 'large'
    elif market_cap >= 2_000_000_000:   # $2B+
        return 'mid'
    elif market_cap >= 300_000_000:     # $300M+
        return 'small'
    else:
        return 'micro'

async def enrich_with_sector_info(stocks: List[Dict]) -> List[Dict]:
    """Enrich stocks with sector information from asset_metadata"""
    try:
        with SessionLocal() as db:
            for stock in stocks:
                # Get sector from asset_metadata table
                result = db.execute(text("""
                    SELECT sector FROM asset_metadata
                    WHERE symbol = :symbol AND country = 'us'
                    LIMIT 1
                """), {"symbol": stock['symbol']}).fetchone()

                if result and result.sector:
                    stock['sector'] = result.sector
                else:
                    stock['sector'] = 'Unknown'

        return stocks

    except Exception as e:
        logger.error(f"Error enriching with sector info: {str(e)}")
        # Return stocks without sector info rather than failing
        for stock in stocks:
            if 'sector' not in stock:
                stock['sector'] = 'Unknown'
        return stocks

import heapq
from collections import defaultdict

def calculate_top_movers_nested(stocks: List[Dict]) -> List[Dict]:
    """Calculate top movers: For each sector-market_cap combination, get top 10 gainers and top 10 losers"""
    movers = []

    # Use a set to track which (symbol, sector, market_cap) combinations we've already processed
    # to avoid duplicates
    processed_combinations = set()

    # Group by Sector -> Market Cap Category (single view, no duplicates)
    sector_market_cap_groups = defaultdict(lambda: defaultdict(list))
    for stock in stocks:
        sector = stock.get('sector', 'Unknown')
        market_cap_category = stock.get('market_cap_category', 'unknown')
        if sector != 'Unknown' and market_cap_category != 'unknown':
            sector_market_cap_groups[sector][market_cap_category].append(stock)

    # Process each sector-market_cap combination
    for sector, market_cap_dict in sector_market_cap_groups.items():
        for market_cap_category, stocks_list in market_cap_dict.items():
            if len(stocks_list) < 1:
                continue

            # Get gainers and losers
            gainers = [s for s in stocks_list if s['price_change_percent'] > 0]
            losers = [s for s in stocks_list if s['price_change_percent'] < 0]

            # Sort and take top 10 of each (increased from 5)
            top_gainers = sorted(gainers, key=lambda x: x['price_change_percent'], reverse=True)[:10]
            top_losers = sorted(losers, key=lambda x: x['price_change_percent'])[:10]

            # Add gainers
            for rank, stock in enumerate(top_gainers, 1):
                combination_key = (stock['symbol'], sector, market_cap_category, 'gainer')
                if combination_key not in processed_combinations:
                    mover = stock.copy()
                    mover.update({
                        'mover_type': 'gainer',
                        'rank_in_category': rank,
                        'category': f'sector_{sector}_marketcap_{market_cap_category}'
                    })
                    movers.append(mover)
                    processed_combinations.add(combination_key)

            # Add losers
            for rank, stock in enumerate(top_losers, 1):
                combination_key = (stock['symbol'], sector, market_cap_category, 'loser')
                if combination_key not in processed_combinations:
                    mover = stock.copy()
                    mover.update({
                        'mover_type': 'loser',
                        'rank_in_category': rank,
                        'category': f'sector_{sector}_marketcap_{market_cap_category}'
                    })
                    movers.append(mover)
                    processed_combinations.add(combination_key)

    return movers

async def store_daily_movers(date: str, movers: List[Dict]) -> int:
    """Store daily movers in the database"""
    try:
        with SessionLocal() as db:
            # Clear existing data for this date
            db.execute(text("""
                DELETE FROM daily_movers WHERE date = :date
            """), {"date": date})

            # Insert new data
            insert_count = 0
            for mover in movers:
                # Parse the new nested category format
                # Examples: 'sector_Technology_marketcap_large' or 'marketcap_mega_sector_Technology'
                category_parts = mover['category'].split('_')

                # Extract category info - always store both sector and market_cap_category from the stock data
                # The category field is just for tracking the grouping logic

                # Get additional technical data
                tech_data = get_technical_data(db, mover['symbol'], date)

                db.execute(text("""
                    INSERT INTO daily_movers (
                        date, symbol, sector, market_cap_category, mover_type, rank_in_category,
                        open_price, close_price, high_price, low_price, price_change, price_change_percent,
                        volume, market_cap, week_52_high, week_52_low, distance_to_52w_high,
                        distance_to_52w_low, rsi, relative_volume, created_at
                    ) VALUES (
                        :date, :symbol, :sector, :market_cap_category, :mover_type, :rank_in_category,
                        :open_price, :close_price, :high_price, :low_price, :price_change, :price_change_percent,
                        :volume, :market_cap, :week_52_high, :week_52_low, :distance_to_52w_high,
                        :distance_to_52w_low, :rsi, :relative_volume, :created_at
                    )
                """), {
                    "date": date,
                    "symbol": mover['symbol'],
                    # Always store both sector and market_cap_category from the stock data
                    "sector": mover.get('sector'),
                    "market_cap_category": mover.get('market_cap_category'),
                    "mover_type": mover['mover_type'],
                    "rank_in_category": mover['rank_in_category'],
                    "open_price": mover['open'],
                    "close_price": mover['close'],
                    "high_price": mover['high'],
                    "low_price": mover['low'],
                    "price_change": mover['price_change'],
                    "price_change_percent": mover['price_change_percent'],
                    "volume": mover['volume'],
                    "market_cap": mover.get('market_cap'),
                    "week_52_high": tech_data.get('week_52_high'),
                    "week_52_low": tech_data.get('week_52_low'),
                    "distance_to_52w_high": tech_data.get('distance_to_52w_high'),
                    "distance_to_52w_low": tech_data.get('distance_to_52w_low'),
                    "rsi": tech_data.get('rsi'),
                    "relative_volume": tech_data.get('relative_volume'),
                    "created_at": datetime.utcnow()
                })
                insert_count += 1

            db.commit()
            logger.info(f"Stored {insert_count} daily movers for {date}")
            return insert_count

    except Exception as e:
        logger.error(f"Error storing daily movers: {str(e)}")
        raise

def get_technical_data(db, symbol: str, date: str) -> Dict:
    """Get additional technical data for a symbol"""
    try:
        result = db.execute(text("""
            SELECT high_252, rsi14, distance_to_52w_high, rel_volume
            FROM technical_latest
            WHERE symbol = :symbol
            LIMIT 1
        """), {"symbol": symbol}).fetchone()

        if result:
            # Calculate 52-week low (approximate)
            week_52_low = None
            if result.high_252 and result.distance_to_52w_high:
                current_price = result.high_252 * (1 - result.distance_to_52w_high)
                # Rough estimate of 52w low as 70% of 52w high
                week_52_low = result.high_252 * 0.7

            return {
                'week_52_high': result.high_252,
                'week_52_low': week_52_low,
                'distance_to_52w_high': result.distance_to_52w_high,
                'distance_to_52w_low': None,  # Would need separate calculation
                'rsi': result.rsi14,
                'relative_volume': result.rel_volume
            }

        return {}

    except Exception as e:
        logger.debug(f"Could not get technical data for {symbol}: {str(e)}")
        return {}