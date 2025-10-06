"""
Asset metadata enrichment service
Enriches asset_metadata table with sector, industry, and market cap data from Finnhub API
"""
import logging
import aiohttp
import asyncio
from datetime import datetime
from typing import Dict, List, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os

logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://stockuser:stockpass123@postgres:5432/stockwatchlist')
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

async def run_asset_metadata_enrichment() -> Dict:
    """
    Enrich asset_metadata table with sector, industry, and market cap data
    This is a one-time job that should be run to populate missing metadata
    """
    logger.info("Starting asset metadata enrichment")

    try:
        # Get symbols that need enrichment
        symbols_to_enrich = await get_symbols_needing_enrichment()
        logger.info(f"Found {len(symbols_to_enrich)} symbols needing enrichment")

        if not symbols_to_enrich:
            return {
                'status': 'success',
                'symbols_processed': 0,
                'symbols_enriched': 0,
                'message': 'All symbols already have complete metadata'
            }

        # Enrich in batches to avoid overwhelming the API
        batch_size = 50  # Increase batch size for better logging
        total_enriched = 0
        total_processed = 0
        total_batches = (len(symbols_to_enrich) + batch_size - 1) // batch_size

        async with aiohttp.ClientSession() as session:
            for i in range(0, len(symbols_to_enrich), batch_size):
                batch = symbols_to_enrich[i:i + batch_size]
                batch_num = i//batch_size + 1
                logger.info(f"Processing batch {batch_num}/{total_batches}: symbols {i+1}-{min(i+batch_size, len(symbols_to_enrich))}")

                batch_enriched = 0
                batch_processed = 0

                for symbol in batch:
                    try:
                        enriched = await enrich_symbol_metadata(session, symbol)
                        batch_processed += 1
                        total_processed += 1
                        if enriched:
                            batch_enriched += 1
                            total_enriched += 1

                        # Respect Finnhub rate limit: 60 requests per minute = 1 per second
                        await asyncio.sleep(1.0)

                    except Exception as e:
                        logger.warning(f"Failed to enrich {symbol}: {str(e)}")
                        batch_processed += 1
                        total_processed += 1

                logger.info(f"Batch {batch_num} completed: {batch_enriched}/{batch_processed} symbols enriched successfully. Total progress: {total_processed}/{len(symbols_to_enrich)} ({100*total_processed/len(symbols_to_enrich):.1f}%)")

                # Longer delay between batches
                if i + batch_size < len(symbols_to_enrich):
                    logger.info("Waiting 3 seconds between batches...")
                    await asyncio.sleep(3)

        result = {
            'status': 'success',
            'symbols_processed': total_processed,
            'symbols_enriched': total_enriched,
            'total_symbols_needing_enrichment': len(symbols_to_enrich)
        }

        logger.info(f"Asset metadata enrichment completed: {result}")
        return result

    except Exception as e:
        logger.error(f"Asset metadata enrichment failed: {str(e)}", exc_info=True)
        raise

async def get_symbols_needing_enrichment() -> List[str]:
    """Get list of symbols that need sector/industry/market_cap enrichment"""
    try:
        with SessionLocal() as db:
            # Get all symbols from symbols table that don't have complete metadata
            result = db.execute(text("""
                SELECT DISTINCT s.symbol
                FROM symbols s
                LEFT JOIN asset_metadata am ON s.symbol = am.symbol AND am.country = 'us'
                WHERE am.symbol IS NULL
                   OR am.sector IS NULL
                   OR am.market_cap IS NULL
                ORDER BY s.symbol
            """)).fetchall()

            return [row.symbol for row in result]

    except Exception as e:
        logger.error(f"Error getting symbols needing enrichment: {str(e)}")
        raise

async def enrich_symbol_metadata(session: aiohttp.ClientSession, symbol: str) -> bool:
    """Enrich a single symbol's metadata using Finnhub API"""
    try:
        # Get company profile from Finnhub via external-apis service
        profile_url = f"http://external-apis:8003/finnhub/company/{symbol}"

        async with session.get(profile_url, timeout=aiohttp.ClientTimeout(total=10)) as response:
            if response.status != 200:
                logger.debug(f"Failed to get profile for {symbol}: HTTP {response.status}")
                return False

            profile_data = await response.json()

        # Get quote data for market cap
        quote_url = f"http://external-apis:8003/finnhub/quote/{symbol}"

        async with session.get(quote_url, timeout=aiohttp.ClientTimeout(total=10)) as response:
            quote_data = {}
            if response.status == 200:
                quote_data = await response.json()

        # Extract relevant fields
        sector = profile_data.get('finnhubIndustry') or profile_data.get('ggroup')
        market_cap = profile_data.get('marketCapitalization')

        # If market cap is in millions, convert to full value
        if market_cap:
            market_cap = market_cap * 1_000_000

        # Update or insert into asset_metadata
        success = await update_asset_metadata(symbol, sector, market_cap, profile_data.get('name'))

        if success:
            logger.debug(f"Enriched {symbol}: sector={sector}, market_cap={market_cap}")

        return success

    except Exception as e:
        logger.warning(f"Error enriching {symbol}: {str(e)}")
        return False

async def update_asset_metadata(symbol: str, sector: Optional[str],
                               market_cap: Optional[float], name: Optional[str]) -> bool:
    """Update asset_metadata table with enriched data"""
    try:
        with SessionLocal() as db:
            # Check if record exists
            existing = db.execute(text("""
                SELECT symbol FROM asset_metadata
                WHERE symbol = :symbol AND country = 'us'
            """), {"symbol": symbol}).fetchone()

            if existing:
                # Update existing record
                db.execute(text("""
                    UPDATE asset_metadata
                    SET sector = COALESCE(:sector, sector),
                        market_cap = COALESCE(:market_cap, market_cap),
                        name = COALESCE(:name, name),
                        updated_at = :updated_at
                    WHERE symbol = :symbol AND country = 'us'
                """), {
                    "symbol": symbol,
                    "sector": sector,
                    "market_cap": str(market_cap) if market_cap else None,
                    "name": name,
                    "updated_at": datetime.utcnow()
                })
            else:
                # Insert new record
                db.execute(text("""
                    INSERT INTO asset_metadata (
                        symbol, country, asset_type, name, sector, market_cap,
                        currency, created_at, updated_at
                    ) VALUES (
                        :symbol, 'us', 'stock', :name, :sector, :market_cap,
                        'USD', :created_at, :updated_at
                    )
                """), {
                    "symbol": symbol,
                    "name": name,
                    "sector": sector,
                    "market_cap": str(market_cap) if market_cap else None,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                })

            db.commit()
            return True

    except Exception as e:
        logger.error(f"Error updating asset metadata for {symbol}: {str(e)}")
        return False

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