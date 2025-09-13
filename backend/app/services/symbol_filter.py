"""
Shared symbol filtering rules used by Schwab calls and Universe refresh.

Rules (exclude/ignore):
- test_issue == 'Y'
- Suffix 'U' or '.U' (SPAC Units)
- Suffix 'W' or '.W' (Warrants)
- Suffix 'R' or '.R' (Rights)
- Contains '$' (Preferred/Hybrid)
- Suffix '.A' '.B' '.C' (Class/Test/Syn variants)
"""
from typing import Optional


def is_excluded_symbol(symbol: Optional[str], test_issue: Optional[str] = None) -> bool:
    s = (symbol or '').strip().upper()
    if not s:
        return True
    if (test_issue or '').strip().upper() == 'Y':
        return True

    # SPAC Units
    if s.endswith('U') or s.endswith('.U'):
        return True
    # Warrants
    if s.endswith('W') or s.endswith('.W'):
        return True
    # Rights
    if s.endswith('R') or s.endswith('.R'):
        return True
    # Preferred/Hybrid
    if '$' in s:
        return True
    # Class/Test/Syn variants
    if s.endswith('.A') or s.endswith('.B') or s.endswith('.C'):
        return True

    return False


def filter_symbols(items: list[tuple[str, Optional[str]]]) -> list[str]:
    """Given a list of (symbol, test_issue) pairs, return filtered symbol list."""
    out: list[str] = []
    for sym, ti in items:
        if sym and not is_excluded_symbol(sym, ti):
            out.append(sym.strip().upper())
    return out

