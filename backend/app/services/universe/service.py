from typing import Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.symbol import Symbol
from app.core.database import SessionLocal
from .nasdaqtrader import NasdaqTraderDownloader


class UniverseService:
    def __init__(self):
        self.downloader = NasdaqTraderDownloader()
    
    def refresh_symbols(self, download: bool = True) -> Dict[str, int]:
        """
        Refresh symbols in the database
        
        Args:
            download: Whether to download fresh data or use existing file
            
        Returns:
            Dictionary with counts: {inserted, updated, total}
        """
        # Get symbol data
        if download:
            symbols_data = self.downloader.download_and_parse()
        else:
            symbols_data = self.downloader.parse_file()
        
        if not symbols_data:
            return {'inserted': 0, 'updated': 0, 'total': 0}
        
        # Process symbols in database
        db = SessionLocal()
        try:
            inserted_count = 0
            updated_count = 0
            
            for symbol_data in symbols_data:
                existing_symbol = db.query(Symbol).filter(
                    Symbol.symbol == symbol_data['symbol']
                ).first()
                
                if existing_symbol:
                    # Update existing symbol
                    for key, value in symbol_data.items():
                        setattr(existing_symbol, key, value)
                    updated_count += 1
                else:
                    # Insert new symbol
                    new_symbol = Symbol(**symbol_data)
                    db.add(new_symbol)
                    inserted_count += 1
            
            db.commit()
            total_count = inserted_count + updated_count
            
            return {
                'inserted': inserted_count,
                'updated': updated_count,
                'total': total_count
            }
            
        except Exception as e:
            db.rollback()
            raise Exception(f"Failed to refresh symbols: {str(e)}")
        finally:
            db.close()
    
    def get_stats(self) -> Dict:
        """
        Get universe statistics
        
        Returns:
            Dictionary with count and last_updated_at
        """
        db = SessionLocal()
        try:
            count = db.query(Symbol).count()
            last_updated = db.query(func.max(Symbol.updated_at)).scalar()
            
            return {
                'count': count,
                'last_updated_at': last_updated
            }
            
        finally:
            db.close()
    
    def get_facets(self) -> Dict:
        """
        Get facets for filtering (exchanges, etf flags, counts)
        
        Returns:
            Dictionary with facet data built from database
        """
        db = SessionLocal()
        try:
            # Get unique exchanges
            exchanges = db.query(Symbol.listing_exchange).distinct().all()
            exchanges = [e[0] for e in exchanges if e[0]]  # Filter out None values
            exchanges.sort()
            
            # Get ETF flags
            etf_flags = db.query(Symbol.etf).distinct().all()
            etf_flags = [e[0] for e in etf_flags if e[0] in ['Y', 'N']]
            etf_flags.sort()
            
            # Get counts
            total_count = db.query(Symbol).count()
            etf_count = db.query(Symbol).filter(Symbol.etf == 'Y').count()
            non_etf_count = db.query(Symbol).filter(Symbol.etf == 'N').count()
            
            return {
                'exchanges': exchanges,
                'etf_flags': etf_flags,
                'counts': {
                    'all': total_count,
                    'etfs': etf_count,
                    'non_etfs': non_etf_count
                }
            }
            
        finally:
            db.close()
    
    def query_symbols(self, 
                     q: Optional[str] = None,
                     exchange: Optional[str] = None,
                     etf: Optional[str] = None,
                     limit: int = 50,
                     offset: int = 0,
                     sort: str = 'symbol',
                     order: str = 'asc') -> Dict:
        """
        Query symbols with filters and pagination
        
        Args:
            q: Search query (symbol prefix or security name substring)
            exchange: Filter by listing exchange
            etf: Filter by ETF flag ('Y' or 'N')
            limit: Page size (max 200)
            offset: Page offset
            sort: Sort field (symbol, security_name, listing_exchange, etf)
            order: Sort order (asc, desc)
            
        Returns:
            Dictionary with items, total, limit, offset
        """
        # Validate and constrain parameters
        limit = min(max(1, limit), 200)
        offset = max(0, offset)
        
        if sort not in ['symbol', 'security_name', 'listing_exchange', 'etf']:
            sort = 'symbol'
        
        if order not in ['asc', 'desc']:
            order = 'asc'
        
        db = SessionLocal()
        try:
            # Start with base query
            query = db.query(Symbol)
            
            # Apply search filter
            if q:
                q = q.strip()
                if len(q) <= 5:
                    # Short query - case-insensitive prefix match on symbol
                    query = query.filter(Symbol.symbol.ilike(f"{q}%"))
                else:
                    # Longer query - case-insensitive substring match on security name
                    query = query.filter(Symbol.security_name.ilike(f"%{q}%"))
            
            # Apply exchange filter
            if exchange:
                query = query.filter(Symbol.listing_exchange == exchange)
            
            # Apply ETF filter
            if etf and etf in ['Y', 'N']:
                query = query.filter(Symbol.etf == etf)
            
            # Get total count before pagination
            total = query.count()
            
            # Apply sorting
            sort_column = getattr(Symbol, sort)
            if order == 'desc':
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column.asc())
            
            # Apply pagination
            items = query.offset(offset).limit(limit).all()
            
            # Convert to dictionaries
            items_data = []
            for item in items:
                items_data.append({
                    'symbol': item.symbol,
                    'security_name': item.security_name,
                    'listing_exchange': item.listing_exchange,
                    'market_category': item.market_category,
                    'test_issue': item.test_issue,
                    'financial_status': item.financial_status,
                    'round_lot_size': item.round_lot_size,
                    'etf': item.etf,
                    'nextshares': item.nextshares,
                    'stooq_symbol': item.stooq_symbol,
                    'updated_at': item.updated_at
                })
            
            return {
                'items': items_data,
                'total': total,
                'limit': limit,
                'offset': offset
            }
            
        finally:
            db.close()
    
    def clear_all_symbols(self) -> Dict[str, int]:
        """
        Clear all symbols from the database
        
        Returns:
            Dictionary with count of deleted symbols
        """
        db = SessionLocal()
        try:
            count = db.query(Symbol).count()
            db.query(Symbol).delete()
            db.commit()
            
            return {'deleted': count}
            
        except Exception as e:
            db.rollback()
            raise Exception(f"Failed to clear symbols: {str(e)}")
        finally:
            db.close()
    
    def get_next_refresh_time(self) -> Dict:
        """
        Calculate the next scheduled refresh time (Sunday 8:00 AM America/Chicago)
        
        Returns:
            Dictionary with next refresh datetime and formatted string
        """
        import pytz
        from datetime import datetime, timedelta
        
        # Get current time in Chicago timezone
        chicago_tz = pytz.timezone('America/Chicago')
        now = datetime.now(chicago_tz)
        
        # Calculate days until next Sunday (0=Monday, 6=Sunday)
        current_weekday = now.weekday()  # 0=Monday, 6=Sunday
        
        if current_weekday == 6:  # Today is Sunday
            # If it's Sunday but before 8 AM, next refresh is today at 8 AM
            if now.hour < 8:
                next_refresh = now.replace(hour=8, minute=0, second=0, microsecond=0)
            else:
                # If it's Sunday after 8 AM, next refresh is next Sunday
                next_refresh = now + timedelta(days=7)
                next_refresh = next_refresh.replace(hour=8, minute=0, second=0, microsecond=0)
        else:
            # Calculate days until next Sunday
            days_until_sunday = (6 - current_weekday) % 7
            if days_until_sunday == 0:  # This handles edge case
                days_until_sunday = 7
            
            next_refresh = now + timedelta(days=days_until_sunday)
            next_refresh = next_refresh.replace(hour=8, minute=0, second=0, microsecond=0)
        
        # Format for display
        formatted_time = next_refresh.strftime("%A, %B %d at %I:%M %p %Z")
        
        return {
            'next_refresh_time': next_refresh.isoformat(),
            'formatted_time': formatted_time,
            'timezone': 'America/Chicago'
        }