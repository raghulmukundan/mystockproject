import json
import time
from typing import Any, Optional, Dict
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

class CacheService:
    def __init__(self, default_ttl: int = 1800):  # 30 minutes default
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.default_ttl = default_ttl
    
    def _is_market_hours_cst(self) -> bool:
        """Check if it's currently market hours in CST"""
        return self._get_market_status()['is_open']
    
    def _get_market_status(self) -> dict:
        """Get detailed market status including next open time"""
        now_utc = datetime.now(timezone.utc)
        # Convert to CST (UTC-6, accounting for DST would be more complex)
        cst_time = now_utc - timedelta(hours=6)
        
        day = cst_time.weekday()  # 0=Monday, 6=Sunday
        hour = cst_time.hour
        minute = cst_time.minute
        total_minutes = hour * 60 + minute
        
        # Check for holidays (basic US market holidays)
        is_holiday = self._is_market_holiday(cst_time)
        
        # Market closed on weekends or holidays
        if day >= 5 or is_holiday:  # Saturday=5, Sunday=6
            next_open = self._get_next_market_open(cst_time)
            return {
                'is_open': False,
                'reason': 'holiday' if is_holiday else 'weekend',
                'next_open': next_open,
                'current_time': cst_time
            }
        
        # Market hours: 8:30 AM - 3:00 PM CST
        market_open = 8 * 60 + 30   # 8:30 AM
        market_close = 15 * 60      # 3:00 PM
        
        is_open = market_open <= total_minutes < market_close
        
        if is_open:
            # Calculate when market closes today
            close_time = cst_time.replace(hour=15, minute=0, second=0, microsecond=0)
            return {
                'is_open': True,
                'closes_at': close_time,
                'current_time': cst_time
            }
        else:
            # Market is closed, find next open
            next_open = self._get_next_market_open(cst_time)
            return {
                'is_open': False,
                'reason': 'after_hours' if total_minutes >= market_close else 'before_hours',
                'next_open': next_open,
                'current_time': cst_time
            }
    
    def _is_market_holiday(self, cst_time: datetime) -> bool:
        """Check if the given date is a US market holiday"""
        # Basic US market holidays (this could be expanded)
        year = cst_time.year
        month = cst_time.month
        day = cst_time.day
        
        # New Year's Day
        if month == 1 and day == 1:
            return True
        
        # Independence Day
        if month == 7 and day == 4:
            return True
        
        # Christmas Day
        if month == 12 and day == 25:
            return True
        
        # Martin Luther King Jr. Day (3rd Monday in January)
        # Presidents Day (3rd Monday in February)
        # Memorial Day (last Monday in May)
        # Labor Day (1st Monday in September)
        # Columbus Day (2nd Monday in October)
        # Veterans Day (November 11)
        # Thanksgiving (4th Thursday in November)
        
        # For now, keep it simple with the major ones
        return False
    
    def _get_next_market_open(self, current_cst: datetime) -> datetime:
        """Calculate the next market open time"""
        next_open = current_cst.replace(hour=8, minute=30, second=0, microsecond=0)
        
        # If we're past today's open time, move to next day
        if current_cst.hour >= 8 and current_cst.minute >= 30:
            next_open += timedelta(days=1)
        
        # Skip weekends and holidays
        while next_open.weekday() >= 5 or self._is_market_holiday(next_open):
            next_open += timedelta(days=1)
            next_open = next_open.replace(hour=8, minute=30, second=0, microsecond=0)
        
        return next_open
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached value if it exists and hasn't expired"""
        if key not in self.cache:
            logger.debug(f"Cache miss for key: {key}")
            return None
        
        cached_item = self.cache[key]
        
        # Check if expired
        if time.time() > cached_item['expires_at']:
            logger.debug(f"Cache expired for key: {key}")
            del self.cache[key]
            return None
        
        logger.debug(f"Cache hit for key: {key}")
        return cached_item['data']
    
    def has_cached_data(self, key: str) -> bool:
        """Check if cached data exists for key (regardless of expiration)"""
        return key in self.cache
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None, extended_ttl: bool = False) -> None:
        """Set cached value with TTL"""
        if ttl is None:
            ttl = self.default_ttl
        
        # If market is closed or extended_ttl is requested, cache for much longer (until next market open)
        if extended_ttl or not self._is_market_hours_cst():
            # Cache until next market day at 8:30 AM CST
            ttl = self._seconds_until_next_market_open()
            logger.info(f"Market closed or extended TTL requested - extending cache TTL to {ttl} seconds")
        
        expires_at = time.time() + ttl
        self.cache[key] = {
            'data': value,
            'expires_at': expires_at,
            'created_at': time.time()
        }
        
        logger.debug(f"Cached key: {key} (TTL: {ttl}s)")
    
    def _seconds_until_next_market_open(self) -> int:
        """Calculate seconds until next market open (8:30 AM CST on next weekday)"""
        now_utc = datetime.now(timezone.utc)
        cst_time = now_utc - timedelta(hours=6)
        
        # Next market day
        next_market_day = cst_time.replace(hour=8, minute=30, second=0, microsecond=0)
        
        # If it's currently past market hours today, go to next day
        if cst_time.hour >= 15:  # Past 3 PM CST
            next_market_day += timedelta(days=1)
        
        # Skip weekends
        while next_market_day.weekday() >= 5:  # Saturday=5, Sunday=6
            next_market_day += timedelta(days=1)
        
        # Convert back to UTC and calculate difference
        next_market_utc = next_market_day + timedelta(hours=6)
        diff = next_market_utc - now_utc
        
        return max(int(diff.total_seconds()), 3600)  # At least 1 hour
    
    def clear(self) -> None:
        """Clear all cached data"""
        self.cache.clear()
        logger.info("Cache cleared")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_items = len(self.cache)
        expired_count = 0
        current_time = time.time()
        
        for item in self.cache.values():
            if current_time > item['expires_at']:
                expired_count += 1
        
        return {
            'total_items': total_items,
            'active_items': total_items - expired_count,
            'expired_items': expired_count,
            'market_hours': self._is_market_hours_cst()
        }
    
    def cleanup_expired(self) -> int:
        """Remove expired items and return count of removed items"""
        current_time = time.time()
        expired_keys = []
        
        for key, item in self.cache.items():
            if current_time > item['expires_at']:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.cache[key]
        
        if expired_keys:
            logger.info(f"Cleaned up {len(expired_keys)} expired cache items")
        
        return len(expired_keys)
    
    def get_market_status(self) -> dict:
        """Get current market status for API responses"""
        return self._get_market_status()
    
    def should_fetch_data(self, cache_key: Optional[str] = None) -> bool:
        """Check if we should fetch new data from APIs"""
        market_status = self._get_market_status()
        
        if not market_status['is_open']:
            # If market is closed but no cache exists for this key, allow first-time fetch
            if cache_key and cache_key not in self.cache:
                logger.info(f"Market closed but no cache exists for {cache_key}, allowing first-time fetch")
                return True
            logger.info(f"Market closed ({market_status.get('reason', 'unknown')}), skipping API calls")
            return False
        
        return True

# Global cache instance
cache_service = CacheService()