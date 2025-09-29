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

        # Get stock data with price movements and metadata
        stocks_data = await get_stocks_with_movements(latest_date)
        logger.info(f"Found {len(stocks_data)} stocks with price data")

        if not stocks_data:
            raise Exception("No stock movement data available for analysis")

        # Categorize stocks by market cap
        stocks_with_market_cap = await enrich_with_market_cap_categories(stocks_data)

        # Categorize by sector (get sector info from asset_metadata)
        stocks_with_sectors = await enrich_with_sector_info(stocks_with_market_cap)

        # Calculate top movers by sector and market cap category
        movers_results = calculate_top_movers(stocks_with_sectors)

        # Store results in database
        stored_count = await store_daily_movers(latest_date, movers_results)

        result = {
            'date': latest_date,
            'total_stocks_analyzed': len(stocks_data),
            'total_movers': stored_count,
            'sectors_processed': len(set(stock.get('sector') for stock in stocks_with_sectors if stock.get('sector'))),
            'market_cap_categories': len(set(stock.get('market_cap_category') for stock in stocks_with_sectors if stock.get('market_cap_category')))
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

            # Fallback to prices_daily_ohlc
            result = db.execute(text("""
                SELECT MAX(date) as latest_date
                FROM prices_daily_ohlc
                WHERE date IS NOT NULL
            """)).fetchone()

            return result.latest_date if result else None

    except Exception as e:
        logger.error(f"Error getting latest trading date: {str(e)}")
        raise

async def get_stocks_with_movements(date: str) -> List[Dict]:
    """Get stock price movements for the given date"""
    try:
        with SessionLocal() as db:
            # Get price data from both sources
            query = text("""
                WITH price_data AS (
                    -- From prices_daily_ohlc
                    SELECT
                        symbol,
                        date,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        close - open AS price_change,
                        CASE
                            WHEN open > 0 THEN ((close - open) / open) * 100
                            ELSE 0
                        END AS price_change_percent
                    FROM prices_daily_ohlc
                    WHERE date = :date

                    UNION ALL

                    -- From historical_prices (for additional coverage)
                    SELECT
                        symbol,
                        date,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        close - open AS price_change,
                        CASE
                            WHEN open > 0 THEN ((close - open) / open) * 100
                            ELSE 0
                        END AS price_change_percent
                    FROM historical_prices
                    WHERE date = :date
                    AND country = 'us'
                    AND asset_type = 'stock'
                )
                SELECT
                    symbol,
                    date,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    price_change,
                    price_change_percent
                FROM price_data
                WHERE ABS(price_change_percent) > 0.5  -- Only include meaningful moves
                ORDER BY ABS(price_change_percent) DESC
                LIMIT 500  -- Process top 500 movers for performance
            """)

            result = db.execute(query, {"date": date}).fetchall()

            stocks = []
            for row in result:
                stocks.append({
                    'symbol': row.symbol,
                    'date': row.date,
                    'open': float(row.open),
                    'high': float(row.high),
                    'low': float(row.low),
                    'close': float(row.close),
                    'volume': int(row.volume),
                    'price_change': float(row.price_change),
                    'price_change_percent': float(row.price_change_percent)
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

def calculate_top_movers(stocks: List[Dict]) -> List[Dict]:
    """Calculate top 5 gainers and 5 losers per sector and market cap category"""
    movers = []

    # Group by sector and get top movers
    sectors = {}
    for stock in stocks:
        sector = stock.get('sector', 'Unknown')
        if sector not in sectors:
            sectors[sector] = []
        sectors[sector].append(stock)

    # Process sector-based movers - always get 5 gainers and 5 losers per sector
    for sector, sector_stocks in sectors.items():
        if sector == 'Unknown' or len(sector_stocks) < 2:
            continue

        # Sort by percentage change - get top 5 of each
        gainers = sorted([s for s in sector_stocks if s['price_change_percent'] > 0],
                        key=lambda x: x['price_change_percent'], reverse=True)[:5]
        losers = sorted([s for s in sector_stocks if s['price_change_percent'] < 0],
                       key=lambda x: x['price_change_percent'])[:5]

        # Add all gainers (up to 5)
        for rank, stock in enumerate(gainers, 1):
            mover = stock.copy()
            mover.update({
                'mover_type': 'gainer',
                'rank_in_category': rank,
                'category': f'sector_{sector}'
            })
            movers.append(mover)

        # Add all losers (up to 5)
        for rank, stock in enumerate(losers, 1):
            mover = stock.copy()
            mover.update({
                'mover_type': 'loser',
                'rank_in_category': rank,
                'category': f'sector_{sector}'
            })
            movers.append(mover)

    # Group by market cap category and get top movers
    market_caps = {}
    for stock in stocks:
        cap_category = stock.get('market_cap_category', 'unknown')
        if cap_category not in market_caps:
            market_caps[cap_category] = []
        market_caps[cap_category].append(stock)

    # Process market cap movers - get top 5 gainers and 5 losers per market cap
    for cap_category, cap_stocks in market_caps.items():
        if cap_category == 'unknown' or len(cap_stocks) < 2:
            continue

        # Sort by percentage change - get top 5 of each
        gainers = sorted([s for s in cap_stocks if s['price_change_percent'] > 0],
                        key=lambda x: x['price_change_percent'], reverse=True)[:5]
        losers = sorted([s for s in cap_stocks if s['price_change_percent'] < 0],
                       key=lambda x: x['price_change_percent'])[:5]

        # Add all gainers (up to 5)
        for rank, stock in enumerate(gainers, 1):
            mover = stock.copy()
            mover.update({
                'mover_type': 'gainer',
                'rank_in_category': rank,
                'category': f'market_cap_{cap_category}'
            })
            movers.append(mover)

        # Add all losers (up to 5)
        for rank, stock in enumerate(losers, 1):
            mover = stock.copy()
            mover.update({
                'mover_type': 'loser',
                'rank_in_category': rank,
                'category': f'market_cap_{cap_category}'
            })
            movers.append(mover)

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
                category_parts = mover['category'].split('_', 1)
                category_type = category_parts[0]  # 'sector' or 'market_cap'
                category_value = category_parts[1] if len(category_parts) > 1 else None

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