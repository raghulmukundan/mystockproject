"""
Shared symbol filtering rules used by Schwab calls and Universe refresh.

Rules (exclude/ignore):
- test_issue == 'Y' (Only exclude actual test issues)
"""
from typing import Optional


def is_excluded_symbol(symbol: Optional[str], test_issue: Optional[str] = None) -> bool:
    s = (symbol or '').strip().upper()
    if not s:
        return True
    # Only exclude actual test issues
    if (test_issue or '').strip().upper() == 'Y':
        return True

    return False


def filter_symbols(items: list[tuple[str, Optional[str]]]) -> list[str]:
    """Given a list of (symbol, test_issue) pairs, return filtered symbol list."""
    out: list[str] = []
    for sym, ti in items:
        if sym and not is_excluded_symbol(sym, ti):
            out.append(sym.strip().upper())
    return out

