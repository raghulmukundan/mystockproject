# Job Chaining System

## Overview

The job chaining system automatically triggers downstream jobs when upstream jobs complete successfully. This ensures data flows through the processing pipeline in the correct order without manual intervention.

## Configuration

Job chains are defined centrally in `jobs-service/app/core/job_chains.json`.

### Chain Definition Format

```json
{
  "job_chains": {
    "job_name": {
      "next_job": "downstream_job_name",
      "description": "Human-readable description",
      "conditions": {
        "weekday_only": true,
        "max_hour": 22
      }
    }
  }
}
```

### Condition Options

- **`weekday_only`**: If `true`, skip trigger on weekends (Saturday/Sunday)
- **`max_hour`**: Skip trigger if current hour is after this value (24-hour format)

## Current Job Chains

### Daily Processing Chain

```
eod_price_scan → technical_compute → daily_movers_calculation → daily_signals_computation
```

1. **EOD Price Scan** fetches latest prices from Schwab API
2. **Technical Compute** calculates indicators (SMA, RSI, MACD, etc.)
3. **Daily Movers** identifies biggest movers by sector/market cap
4. **Daily Signals** computes bullish/bearish signals and trade levels

**Conditions**: Weekday only, before 10 PM

### Weekly Processing Chain

```
weekly_bars_etl → weekly_technicals_etl → weekly_signals_computation
```

1. **Weekly Bars ETL** aggregates daily data to Friday week-end bars
2. **Weekly Technicals** computes weekly indicators (SMA10w, SMA30w, etc.)
3. **Weekly Signals** calculates weekly trend signals and scores

**Conditions**: Any day, before 11 PM

### Standalone Jobs

These jobs have no chained jobs:
- `nasdaq_universe_refresh` - Updates tradable symbol list
- `update_market_data` - Manual market data updates
- `job_ttl_cleanup` - Cleans up old job records
- `schwab_token_validation` - Validates Schwab API token
- `asset_metadata_enrichment` - Enriches asset metadata

## Usage

### Automatic Chaining

Jobs automatically trigger their downstream jobs upon successful completion. No manual intervention needed.

Example flow when EOD scan runs:
1. EOD scan completes successfully
2. `trigger_next_job_in_chain("eod_price_scan")` is called
3. System checks conditions (weekday, time)
4. If conditions pass, `technical_compute` job starts
5. When tech job completes, it triggers `daily_movers_calculation`
6. And so on...

### Manual Job Runs

When you manually run a job via the UI or API, the chain still triggers automatically. For example:

- Run **Technical Compute** manually → automatically triggers **Daily Movers** → automatically triggers **Daily Signals**

### Adding a New Job to a Chain

1. **Update `job_chains.json`**:
```json
{
  "your_new_job": {
    "next_job": "downstream_job_name",
    "description": "What this job does",
    "conditions": {
      "weekday_only": false,
      "max_hour": 23
    }
  }
}
```

2. **Update your job file** (e.g., `your_new_job.py`):
```python
from app.core.job_chain_manager import trigger_next_job_in_chain

async def run_your_new_job():
    job_name = "your_new_job"
    try:
        # ... your job logic ...

        # Trigger next job in chain
        await trigger_next_job_in_chain(job_name)

        return result
    except Exception as e:
        logger.error(f"Job failed: {e}")
        raise
```

3. **Update `job_chain_manager.py`** to add executor for new job:
```python
async def _execute_job(job_name: str):
    # ... existing jobs ...

    elif job_name == "your_new_job":
        from app.services.your_new_job import run_your_new_job
        return await run_your_new_job()
```

## API

### Get Chain Information

```python
from app.core.job_chain_manager import get_job_chain_info

info = get_job_chain_info("technical_compute")
# Returns: {
#   "job_name": "technical_compute",
#   "next_job": "daily_movers_calculation",
#   "description": "Technical analysis triggers daily movers",
#   "conditions": {"weekday_only": true, "max_hour": 22},
#   "has_chain": true
# }
```

### Get All Chains

```python
from app.core.job_chain_manager import get_all_chains

chains = get_all_chains()
# Returns entire job chain configuration
```

### Manual Trigger

```python
from app.core.job_chain_manager import trigger_next_job_in_chain

# Automatically triggers next job if conditions are met
result = await trigger_next_job_in_chain("technical_compute")
```

## Logging

Job chains produce structured logs:

```
🔗 JOB CHAIN: technical_compute → daily_movers_calculation - Triggering next job in chain
✅ JOB CHAIN: technical_compute → daily_movers_calculation - Successfully triggered and completed
```

Skipped chains:
```
⏸️  JOB CHAIN: technical_compute → daily_movers_calculation - Conditions not met, skipping trigger
```

No chain configured:
```
🏁 JOB CHAIN: daily_signals_computation - No chained job configured, chain ends here
```

## Error Handling

- If a chained job fails, the **parent job is still considered successful**
- The error is logged but not re-raised
- This prevents cascading failures from blocking the entire pipeline

## Benefits

1. **Centralized Configuration**: All chains defined in one JSON file
2. **Consistency**: Same chaining logic for scheduled and manual runs
3. **Visibility**: Clear logs showing chain progression
4. **Maintainability**: Easy to add/modify/remove chains
5. **Resilience**: Parent job success independent of downstream failures
6. **Conditional Logic**: Time and day-based conditions prevent inappropriate runs
