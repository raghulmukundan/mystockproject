import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.models.current_price import CurrentPrice
from app.models.watchlist import Watchlist
from app.models.watchlist_item import WatchlistItem
from app.services.stock_data import stock_data_service
from app.core.config import PRICE_CACHE_TTL_MINUTES
from app.services.cache_service import cache_service

logger = logging.getLogger(__name__)

class PriceCacheService:
    def __init__(self):
        self.refresh_interval_minutes = PRICE_CACHE_TTL_MINUTES
        self._refresh_task = None
    
    def _is_market_open(self) -> bool:
        """Check if market is currently open using the cache service"""
        try:
            market_status = cache_service.get_market_status()
            return market_status.get('is_open', False)
        except Exception as e:
            logger.error(f"Error checking market status: {e}")
            # Default to open for safety (don't skip updates due to errors)
            return True
        
    def start_background_refresh(self):
        """Start the background price refresh task"""
        if self._refresh_task is None or self._refresh_task.done():
            self._refresh_task = asyncio.create_task(self._background_refresh_loop())
            logger.info(f"Started price cache background refresh (every {self.refresh_interval_minutes} minutes)")
    
    def stop_background_refresh(self):
        """Stop the background price refresh task"""
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()
            logger.info("Stopped price cache background refresh")
    
    async def _background_refresh_loop(self):
        """Background loop that refreshes prices every N minutes during market hours only"""
        while True:
            try:
                # Check if market is open before refreshing
                if self._is_market_open():
                    logger.info("Market is open - refreshing watchlist prices")
                    await self.refresh_all_watchlist_prices()
                else:
                    logger.info("Market is closed - skipping price refresh")
                
                # Sleep for the configured interval
                await asyncio.sleep(self.refresh_interval_minutes * 60)
            except asyncio.CancelledError:
                logger.info("Price refresh background task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in price refresh background loop: {e}")
                # Wait a bit before retrying on error
                await asyncio.sleep(60)
    
    async def refresh_all_watchlist_prices(self):
        """Refresh prices for all symbols in all watchlists"""
        db = next(get_db())
        try:
            # Get all unique symbols from all watchlists
            symbols = db.query(WatchlistItem.symbol).distinct().all()
            symbol_list = [s[0] for s in symbols]
            
            if not symbol_list:
                logger.info("No symbols found in watchlists to refresh")
                return
                
            logger.info(f"Refreshing prices for {len(symbol_list)} symbols: {symbol_list}")
            
            # Fetch prices from Finnhub
            prices_data = await stock_data_service.get_multiple_stock_prices(symbol_list)
            
            # Update database
            updated_count = 0
            for symbol, price_data in prices_data.items():
                try:
                    # UPSERT: Update existing or insert new
                    existing_price = db.query(CurrentPrice).filter(CurrentPrice.symbol == symbol).first()
                    
                    if existing_price:
                        existing_price.current_price = price_data.current_price
                        existing_price.change_amount = price_data.change
                        existing_price.change_percent = price_data.change_percent
                        existing_price.volume = price_data.volume
                        existing_price.market_cap = price_data.market_cap
                        existing_price.last_updated = datetime.now(timezone.utc)
                        existing_price.source = 'finnhub'
                    else:
                        new_price = CurrentPrice(
                            symbol=symbol,
                            current_price=price_data.current_price,
                            change_amount=price_data.change,
                            change_percent=price_data.change_percent,
                            volume=price_data.volume,
                            market_cap=price_data.market_cap,
                            last_updated=datetime.now(timezone.utc),
                            source='finnhub'
                        )
                        db.add(new_price)
                    
                    updated_count += 1
                except Exception as e:
                    logger.error(f"Error updating price for {symbol}: {e}")
                    continue
            
            db.commit()
            logger.info(f"Successfully updated {updated_count} stock prices")
            
        except Exception as e:
            logger.error(f"Error refreshing watchlist prices: {e}")
            db.rollback()
        finally:
            db.close()
    
    async def get_cached_prices(self, symbols: List[str]) -> Dict[str, dict]:
        """Get cached prices from database"""
        db = next(get_db())
        try:
            prices = db.query(CurrentPrice).filter(CurrentPrice.symbol.in_(symbols)).all()
            
            result = {}
            for price in prices:
                result[price.symbol] = price.to_dict()
            
            # Check for missing symbols and log
            missing_symbols = set(symbols) - set(result.keys())
            if missing_symbols:
                logger.warning(f"Missing cached prices for symbols: {missing_symbols}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting cached prices: {e}")
            return {}
        finally:
            db.close()
    
    async def get_cached_price(self, symbol: str) -> Optional[dict]:
        """Get cached price for a single symbol"""
        result = await self.get_cached_prices([symbol])
        return result.get(symbol)
    
    async def force_refresh_symbol(self, symbol: str) -> bool:
        """Force refresh price for a specific symbol"""
        try:
            price_data = await stock_data_service.get_stock_price(symbol)
            if not price_data:
                return False
                
            db = next(get_db())
            try:
                # UPSERT
                existing_price = db.query(CurrentPrice).filter(CurrentPrice.symbol == symbol).first()
                
                if existing_price:
                    existing_price.current_price = price_data.current_price
                    existing_price.change_amount = price_data.change
                    existing_price.change_percent = price_data.change_percent
                    existing_price.volume = price_data.volume
                    existing_price.market_cap = price_data.market_cap
                    existing_price.last_updated = datetime.now(timezone.utc)
                    existing_price.source = 'finnhub'
                else:
                    new_price = CurrentPrice(
                        symbol=symbol,
                        current_price=price_data.current_price,
                        change_amount=price_data.change,
                        change_percent=price_data.change_percent,
                        volume=price_data.volume,
                        market_cap=price_data.market_cap,
                        last_updated=datetime.now(timezone.utc),
                        source='finnhub'
                    )
                    db.add(new_price)
                
                db.commit()
                logger.info(f"Force refreshed price for {symbol}")
                return True
                
            except Exception as e:
                logger.error(f"Error force refreshing price for {symbol}: {e}")
                db.rollback()
                return False
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error fetching price for force refresh of {symbol}: {e}")
            return False
    
    def is_price_stale(self, last_updated: datetime) -> bool:
        """Check if a price is stale (older than cache TTL)"""
        if not last_updated:
            return True
            
        now = datetime.now(timezone.utc)
        age_minutes = (now - last_updated).total_seconds() / 60
        return age_minutes > self.refresh_interval_minutes
    
    async def get_cache_stats(self) -> dict:
        """Get cache statistics"""
        db = next(get_db())
        try:
            total_cached = db.query(CurrentPrice).count()
            market_status = cache_service.get_market_status()
            
            # Get oldest and newest entries
            if total_cached > 0:
                oldest = db.query(CurrentPrice).order_by(CurrentPrice.last_updated.asc()).first()
                newest = db.query(CurrentPrice).order_by(CurrentPrice.last_updated.desc()).first()
                
                # Count stale entries
                cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=self.refresh_interval_minutes)
                stale_count = db.query(CurrentPrice).filter(CurrentPrice.last_updated < cutoff_time).count()
                
                return {
                    'total_cached_prices': total_cached,
                    'stale_prices': stale_count,
                    'fresh_prices': total_cached - stale_count,
                    'oldest_entry': oldest.last_updated.isoformat() if oldest else None,
                    'newest_entry': newest.last_updated.isoformat() if newest else None,
                    'cache_ttl_minutes': self.refresh_interval_minutes,
                    'background_refresh_running': self._refresh_task is not None and not self._refresh_task.done(),
                    'market_open': market_status.get('is_open', False),
                    'market_status': market_status
                }
            else:
                return {
                    'total_cached_prices': 0,
                    'stale_prices': 0,
                    'fresh_prices': 0,
                    'cache_ttl_minutes': self.refresh_interval_minutes,
                    'background_refresh_running': self._refresh_task is not None and not self._refresh_task.done(),
                    'market_open': market_status.get('is_open', False),
                    'market_status': market_status
                }
                
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {'error': str(e)}
        finally:
            db.close()

# Global instance
price_cache_service = PriceCacheService()