"""
External APIs price provider for jobs-service
"""
import httpx
import logging
from typing import List, Optional
from app.core.config import EXTERNAL_APIS_URL
from app.services.prices.upsert import Bar

logger = logging.getLogger(__name__)

class ProviderError(Exception):
    """Custom exception for provider errors"""
    def __init__(self, status_code: Optional[int], message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)

class ExternalApiProvider:
    """Provider that calls external-apis service for price data"""

    def __init__(self):
        self.base_url = EXTERNAL_APIS_URL

    async def get_daily_history(self, symbol: str, start_date: str, end_date: str) -> List[Bar]:
        """Get daily price history from external-apis service"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(
                    f"{self.base_url}/schwab/history/{symbol}/daily",
                    params={
                        "start": start_date,
                        "end": end_date
                    }
                )

                if response.status_code != 200:
                    raise ProviderError(
                        response.status_code,
                        f"External API returned {response.status_code}: {response.text}"
                    )

                data = response.json()
                bars = []

                # Convert response to Bar objects
                # The Schwab daily endpoint returns an array of BarResponse objects
                if isinstance(data, list):
                    for bar_data in data:
                        bar = Bar(
                            date=bar_data.get("date", ""),
                            open=float(bar_data.get("open", 0)),
                            high=float(bar_data.get("high", 0)),
                            low=float(bar_data.get("low", 0)),
                            close=float(bar_data.get("close", 0)),
                            volume=int(bar_data.get("volume", 0))
                        )
                        bars.append(bar)

                return bars

        except httpx.ConnectError as e:
            raise ProviderError(None, f"Connection failed to {self.base_url}: {str(e)}")
        except httpx.TimeoutException as e:
            raise ProviderError(None, f"Request timeout to {self.base_url}: {str(e)}")
        except httpx.RequestError as e:
            raise ProviderError(None, f"Request failed to {self.base_url}: {type(e).__name__}: {str(e)}")
        except Exception as e:
            raise ProviderError(None, f"Unexpected error: {type(e).__name__}: {str(e)}")

    def get_daily_history_sync(self, symbol: str, start_date: str, end_date: str) -> List[Bar]:
        """Synchronous version for backwards compatibility"""
        import asyncio
        return asyncio.run(self.get_daily_history(symbol, start_date, end_date))