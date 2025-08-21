from datetime import datetime, timedelta
from typing import Tuple

def parse_range_to_dates(range_str: str) -> Tuple[datetime, datetime]:
    """
    Parse range string (e.g., '6m', '1y', '3mo') to start and end dates
    Returns (start_date, end_date) as datetime objects
    """
    end_date = datetime.now()
    
    if range_str.endswith('m') or range_str.endswith('mo'):
        # Parse months
        if range_str.endswith('mo'):
            months = int(range_str[:-2])
        else:
            months = int(range_str[:-1])
        start_date = end_date - timedelta(days=months * 30)
    elif range_str.endswith('y'):
        # Parse years
        years = int(range_str[:-1])
        start_date = end_date - timedelta(days=years * 365)
    elif range_str.endswith('d'):
        # Parse days
        days = int(range_str[:-1])
        start_date = end_date - timedelta(days=days)
    else:
        # Default to 6 months
        start_date = end_date - timedelta(days=180)
    
    return start_date, end_date

def date_to_string(date: datetime) -> str:
    """Convert datetime to YYYY-MM-DD string"""
    return date.strftime('%Y-%m-%d')

def string_to_date(date_str: str) -> datetime:
    """Convert YYYY-MM-DD string to datetime"""
    return datetime.strptime(date_str, '%Y-%m-%d')