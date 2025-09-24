"""
Price storage service for managing cached prices in jobs service
"""
import logging
from datetime import datetime
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.db.models import CachedPrice

logger = logging.getLogger(__name__)

class PriceStorageService:
    """Service for storing and retrieving cached price data"""
    
    async def store_prices(self, prices_data: Dict[str, Dict]) -> int:
        """
        Store price data in the cache
        
        Args:
            prices_data: Dict where key is symbol and value is price data dict
            
        Returns:
            Number of prices stored
        """
        db = next(get_db())
        stored_count = 0
        
        try:
            for symbol, price_data in prices_data.items():
                try:
                    # Check if price already exists
                    existing_price = db.query(CachedPrice).filter(
                        CachedPrice.symbol == symbol
                    ).first()
                    
                    if existing_price:
                        # Update existing price
                        existing_price.current_price = price_data.get('current_price', 0.0)
                        existing_price.change_amount = price_data.get('change', 0.0)
                        existing_price.change_percent = price_data.get('change_percent', 0.0)
                        existing_price.volume = price_data.get('volume', 0)
                        existing_price.market_cap = price_data.get('market_cap')
                        existing_price.updated_at = datetime.utcnow()
                    else:
                        # Create new price entry
                        new_price = CachedPrice(
                            symbol=symbol,
                            current_price=price_data.get('current_price', 0.0),
                            change_amount=price_data.get('change', 0.0),
                            change_percent=price_data.get('change_percent', 0.0),
                            volume=price_data.get('volume', 0),
                            market_cap=price_data.get('market_cap'),
                            updated_at=datetime.utcnow()
                        )
                        db.add(new_price)
                    
                    stored_count += 1
                    
                except Exception as e:
                    logger.error(f"Error storing price for {symbol}: {e}")
                    continue
            
            db.commit()
            logger.info(f"Successfully stored {stored_count} price updates")
            return stored_count
            
        except Exception as e:
            logger.error(f"Error in store_prices: {e}")
            db.rollback()
            return 0
        finally:
            db.close()
    
    async def get_cached_prices(self, symbols: List[str]) -> Dict[str, Dict]:
        """Get cached prices for symbols"""
        db = next(get_db())
        try:
            prices = db.query(CachedPrice).filter(
                CachedPrice.symbol.in_(symbols)
            ).all()
            
            result = {}
            for price in prices:
                result[price.symbol] = price.to_dict()
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting cached prices: {e}")
            return {}
        finally:
            db.close()
    
    async def get_cache_stats(self) -> Dict:
        """Get cache statistics"""
        db = next(get_db())
        try:
            total_count = db.query(CachedPrice).count()
            
            # Get oldest and newest update times
            oldest = db.query(CachedPrice.updated_at).order_by(
                CachedPrice.updated_at.asc()
            ).first()
            
            newest = db.query(CachedPrice.updated_at).order_by(
                CachedPrice.updated_at.desc()
            ).first()
            
            return {
                'total_symbols': total_count,
                'oldest_update': oldest[0].isoformat() if oldest and oldest[0] else None,
                'newest_update': newest[0].isoformat() if newest and newest[0] else None
            }
            
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {'total_symbols': 0}
        finally:
            db.close()

# Singleton instance
price_storage = PriceStorageService()