import httpx
import asyncio
from typing import List, Set

class SymbolValidator:
    def __init__(self):
        self.nasdaq_symbols: Set[str] = set()
        self.last_updated = None

    async def update_nasdaq_symbols(self):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.nasdaq.com/api/screener/stocks",
                    params={
                        "tableonly": "true",
                        "limit": "25000",
                        "offset": "0"
                    },
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                )
                if response.status_code == 200:
                    data = response.json()
                    if "data" in data and "table" in data["data"] and "rows" in data["data"]["table"]:
                        self.nasdaq_symbols = {row["symbol"] for row in data["data"]["table"]["rows"]}
                        return True
        except Exception as e:
            print(f"Error updating NASDAQ symbols: {e}")
        return False

    async def validate_symbols(self, symbols: List[str]) -> tuple[List[str], List[str]]:
        if not self.nasdaq_symbols:
            await self.update_nasdaq_symbols()
        
        valid_symbols = []
        invalid_symbols = []
        print(symbols)
        print("*****")
        print(self.nasdaq_symbols)
        for symbol in symbols:
            symbol = symbol.upper().strip()
            if symbol in self.nasdaq_symbols:
                valid_symbols.append(symbol)
            else:
                invalid_symbols.append(symbol)
        
        return valid_symbols, invalid_symbols

symbol_validator = SymbolValidator()