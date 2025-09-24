"""
Symbol mapping helpers for Schwab API
"""

def to_schwab_symbol(sym: str) -> str:
    """
    Convert standard symbol format to Schwab API format.
    
    Args:
        sym: Standard symbol (e.g., 'BRK.B', 'BF.B', 'AAPL')
        
    Returns:
        Schwab-formatted symbol (e.g., 'BRK/B', 'BF/B', 'AAPL')
    """
    s = sym.strip().upper()
    
    # Class shares: BRK.B -> BRK/B, BF.B -> BF/B
    if "." in s and len(s.split(".")[-1]) == 1:
        left, right = s.split(".", 1)
        return f"{left}/{right}"
    
    return s

def from_schwab_symbol(sym: str) -> str:
    """
    Convert Schwab API format back to standard symbol format.
    
    Args:
        sym: Schwab-formatted symbol (e.g., 'BRK/B', 'BF/B', 'AAPL')
        
    Returns:
        Standard symbol (e.g., 'BRK.B', 'BF.B', 'AAPL')
    """
    s = sym.strip().upper()
    
    # Class shares: BRK/B -> BRK.B, BF/B -> BF.B
    if "/" in s and len(s.split("/")[-1]) == 1:
        left, right = s.split("/", 1)
        return f"{left}.{right}"
    
    return s