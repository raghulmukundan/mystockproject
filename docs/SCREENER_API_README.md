# Screener API Documentation

Production-ready FastAPI endpoint for stock screening with comprehensive filtering, sorting, and pagination.

## Quick Start

### 1. Install Dependencies
```bash
pip install -r api/requirements.txt
```

### 2. Run Migrations
```bash
make migrate-screener
```

### 3. Start Server
```bash
make screener-api
# or
DB_DSN=postgresql+psycopg://postgres:postgres123@localhost:5432/mystockproject \
uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload
```

Server runs on: http://localhost:8000
Interactive docs: http://localhost:8000/docs

---

## API Endpoints

### GET /api/screener

Query stocks with comprehensive filters, sorting, and pagination.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `minPrice` | float | Minimum close price |
| `maxPrice` | float | Maximum close price |
| `minAvgVol20` | int | Minimum 20-day average volume |
| `minRelVolume` | float | Minimum relative volume (vs 20-day avg) |
| `maxDistanceTo52wHigh` | float | Max distance from 52w high (e.g., -0.05 = within 5%) |
| `aboveSMA200` | bool | Filter for price above 200 SMA |
| `smaBullStack` | bool | Filter for SMA20 > SMA50 > SMA200 |
| `macdCrossUp` | bool | Filter for MACD cross up signal |
| `donchBreakout` | bool | Filter for Donchian 20 breakout |
| `weeklyStrong` | bool | Filter for weekly strong (close_above_30w AND stack_10_30_40) |
| `minTrendScoreD` | int | Minimum daily trend score (0-55) |
| `minTrendScoreW` | int | Minimum weekly trend score (0-70) |
| `sort` | string | Sort column and direction (e.g., "combined_score DESC") |
| `page` | int | Page number (1-indexed, default: 1) |
| `pageSize` | int | Results per page (default: 50, max: 200) |

**Allowed Sort Columns:**
- `symbol`, `close`, `volume`, `avg_vol20`, `rel_volume`
- `rsi14`, `adx14`, `distance_to_52w_high`, `pct_from_52w_high`
- `trend_score_d`, `trend_score_w`, `combined_score`
- `risk_reward_ratio`, `distance_from_entry_pct`
- `sma20`, `sma50`, `sma200`, `macd`, `macd_hist`
- `daily_date`, `weekly_date`

---

## Example Queries

### 1. Top Combined Scores (Daily + Weekly)
```bash
curl "http://localhost:8000/api/screener?sort=combined_score%20DESC&page=1&pageSize=20"
```

### 2. Breakouts Above 200 SMA with Volume
```bash
curl "http://localhost:8000/api/screener?aboveSMA200=true&donchBreakout=true&minAvgVol20=500000&sort=trend_score_d%20DESC"
```

### 3. Weekly Strong + Daily Alignment
```bash
curl "http://localhost:8000/api/screener?weeklyStrong=true&smaBullStack=true&minTrendScoreD=30&sort=combined_score%20DESC"
```

### 4. Near 52-Week High with High Volume
```bash
curl "http://localhost:8000/api/screener?maxDistanceTo52wHigh=-0.05&minRelVolume=1.5&sort=rel_volume%20DESC"
```

### 5. MACD Cross with High Scores
```bash
curl "http://localhost:8000/api/screener?macdCrossUp=true&minTrendScoreW=40&sort=risk_reward_ratio%20DESC"
```

### 6. Price Range Filter
```bash
curl "http://localhost:8000/api/screener?minPrice=10&maxPrice=100&minAvgVol20=1000000&sort=combined_score%20DESC"
```

### 7. High Daily Trend Score
```bash
curl "http://localhost:8000/api/screener?minTrendScoreD=40&sort=trend_score_d%20DESC&pageSize=10"
```

### 8. SMA Bull Stack with Weekly Confirmation
```bash
curl "http://localhost:8000/api/screener?smaBullStack=true&minTrendScoreW=50&sort=combined_score%20DESC"
```

### 9. Donchian Breakouts Only
```bash
curl "http://localhost:8000/api/screener?donchBreakout=true&minAvgVol20=250000&sort=adx14%20DESC"
```

### 10. Pagination Example
```bash
# Page 1
curl "http://localhost:8000/api/screener?aboveSMA200=true&page=1&pageSize=50"

# Page 2
curl "http://localhost:8000/api/screener?aboveSMA200=true&page=2&pageSize=50"
```

---

## Response Format

```json
{
  "results": [
    {
      "symbol": "AAPL",
      "daily_date": "2025-01-15",
      "weekly_date": "2025-01-17",
      "close": 225.50,
      "volume": 52340000,
      "avg_vol20": 48250000,
      "rel_volume": 1.08,
      "sma20": 220.30,
      "sma50": 215.80,
      "sma200": 195.40,
      "rsi14": 62.5,
      "adx14": 28.3,
      "atr14": 3.25,
      "sma20_cross_50_up": false,
      "price_above_200": true,
      "macd_cross_up": false,
      "donch20_breakout": true,
      "trend_score_d": 30,
      "trend_score_w": 55,
      "combined_score": 85,
      "proposed_entry": 226.00,
      "proposed_stop": 219.50,
      "target1": 232.50,
      "target2": 235.80,
      "risk_reward_ratio": 2.0,
      "sma_bull_stack": true,
      "weekly_strong": true,
      "pct_from_52w_high": -2.3
    }
  ],
  "total_count": 127,
  "page": 1,
  "page_size": 50,
  "total_pages": 3
}
```

---

## UI Filter Chip Mapping

For frontend integration, map UI chips to API parameters:

| UI Chip | API Parameter | Value |
|---------|---------------|-------|
| "Above 200 SMA" | `aboveSMA200` | `true` |
| "SMA Bull Stack" | `smaBullStack` | `true` |
| "MACD Cross ↑" | `macdCrossUp` | `true` |
| "Donchian Breakout" | `donchBreakout` | `true` |
| "Weekly Strong" | `weeklyStrong` | `true` |
| "High Daily Score" | `minTrendScoreD` | `40` |
| "High Weekly Score" | `minTrendScoreW` | `50` |
| "Near 52w High" | `maxDistanceTo52wHigh` | `-0.05` |
| "High Volume" | `minRelVolume` | `1.5` |

---

## Environment Variables

```bash
# PostgreSQL connection
DB_DSN=postgresql+psycopg://postgres:postgres123@localhost:5432/mystockproject

# Screener defaults
SCREENER_DEFAULT_SORT="combined_score DESC, trend_score_w DESC"
SCREENER_PAGE_SIZE_DEFAULT=50
SCREENER_MAX_PAGE_SIZE=200
```

---

## Response Fields

### Daily Technicals
- `close`, `volume`, `avg_vol20`, `rel_volume`
- `sma20`, `sma50`, `sma200`, `rsi14`, `adx14`, `atr14`
- `donch20_high`, `donch20_low`
- `macd`, `macd_signal`, `macd_hist`
- `high_252`, `distance_to_52w_high`, `sma_slope`

### Daily Signals (6)
- `sma20_cross_50_up`: SMA20 crossed above SMA50
- `price_above_200`: Price above 200 SMA
- `rsi_cross_50_up`: RSI crossed above 50
- `macd_cross_up`: MACD crossed above signal line
- `donch20_breakout`: Breakout above Donchian 20-day high (with ADX > 20)
- `high_tight_zone`: Within 5% of 52w high with rel_volume >= 1.5

### Daily Scores & Trade Levels
- `trend_score_d`: Daily trend score (0-55)
- `proposed_entry`, `proposed_stop`, `target1`, `target2`
- `risk_reward_ratio`: (target1 - entry) / (entry - stop)
- `daily_notes`: Warnings (low ADX, weak volume, overbought)

### Weekly Technicals
- `sma10w`, `sma30w`, `sma40w`, `rsi14w`, `adx14w`, `atr14w`
- `donch20w_high`, `donch20w_low`
- `macd_w`, `macd_signal_w`, `macd_hist_w`
- `avg_vol10w`, `high_52w`, `distance_to_52w_high_w`, `sma_w_slope`

### Weekly Signals (5)
- `stack_10_30_40`: SMA10w > SMA30w > SMA40w
- `close_above_30w`: Close above 30-week SMA
- `donch20w_breakout`: Breakout above Donchian 20-week high
- `macd_w_cross_up`: Weekly MACD cross up
- `rsi14w_gt_50`: Weekly RSI above 50

### Weekly Score
- `trend_score_w`: Weekly trend score (0-70)

### Derived Fields
- `sma_bull_stack`: SMA20 > SMA50 > SMA200 (daily)
- `weekly_strong`: close_above_30w AND stack_10_30_40
- `combined_score`: trend_score_d + trend_score_w (0-125)
- `distance_from_entry_pct`: % distance from proposed entry
- `pct_from_52w_high`: % distance from 52-week high

---

## Error Handling

### 400 Bad Request
```json
{
  "detail": "Invalid sort column: invalid_column"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error: <error_message>"
}
```

---

## Health Check

```bash
curl "http://localhost:8000/health"
```

Response:
```json
{
  "status": "healthy"
}
```

---

## Production Deployment

### 1. Install Dependencies
```bash
pip install -r api/requirements.txt
```

### 2. Set Environment Variables
```bash
export DB_DSN="postgresql+psycopg://user:pass@host:5432/dbname"
export SCREENER_DEFAULT_SORT="combined_score DESC"
export SCREENER_PAGE_SIZE_DEFAULT=50
export SCREENER_MAX_PAGE_SIZE=200
```

### 3. Run with Gunicorn
```bash
gunicorn api.app:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### 4. Add to Makefile
Already included:
```bash
make screener-api
```

---

## Testing

### Test Basic Query
```bash
curl -s "http://localhost:8000/api/screener?pageSize=5" | jq '.results | length'
```

### Test Filters
```bash
curl -s "http://localhost:8000/api/screener?aboveSMA200=true&pageSize=5" | jq '.total_count'
```

### Test Sorting
```bash
curl -s "http://localhost:8000/api/screener?sort=trend_score_d%20DESC&pageSize=5" | \
  jq '.results[0].trend_score_d'
```

### Test Pagination
```bash
curl -s "http://localhost:8000/api/screener?page=1&pageSize=10" | jq '.total_pages'
```

---

## Integration with Frontend

### Example React Hook
```typescript
const fetchScreenerResults = async (filters: ScreenerFilters) => {
  const params = new URLSearchParams();

  if (filters.aboveSMA200) params.append('aboveSMA200', 'true');
  if (filters.smaBullStack) params.append('smaBullStack', 'true');
  if (filters.minTrendScoreD) params.append('minTrendScoreD', filters.minTrendScoreD.toString());

  params.append('sort', filters.sort || 'combined_score DESC');
  params.append('page', filters.page.toString());
  params.append('pageSize', filters.pageSize.toString());

  const response = await fetch(`/api/screener?${params.toString()}`);
  return response.json();
}
```

---

## Performance Notes

1. **Indexes**: All common filters have dedicated indexes (see `migrations/003_indexes.sql`)
2. **Partial Indexes**: Boolean filters use partial indexes with WHERE clauses for efficiency
3. **View Optimization**: `screener_latest` view uses LEFT JOINs for flexibility
4. **Connection Pooling**: SQLAlchemy pool_size=10, max_overflow=20
5. **Query Planner**: Run `ANALYZE` on tables regularly for optimal query plans

---

## Support

For issues or questions, see project documentation or create an issue.
