"""
Symbol filtering utilities for jobs service
"""
import logging
from typing import List

logger = logging.getLogger(__name__)

def filter_symbols(symbol_rows) -> List[str]:
    """Filter symbols to exclude test issues and unwanted types"""
    filtered = []
    for symbol, test_issue in symbol_rows:
        if not is_excluded_symbol(symbol, test_issue):
            filtered.append(symbol)

    logger.info(f"Filtered {len(symbol_rows)} symbols down to {len(filtered)} valid symbols")
    return filtered

def is_excluded_symbol(symbol: str, test_issue: str = None) -> bool:
    """Check if symbol should be excluded from processing"""
    if not symbol:
        return True

    # Exclude test issues
    if test_issue and test_issue.upper() == 'Y':
        return True

    # Exclude certain suffix types (these are usually not regular stocks)
    excluded_suffixes = ['.WS', '.RT', '.UN', '.WT']
    for suffix in excluded_suffixes:
        if symbol.endswith(suffix):
            return True

    return False