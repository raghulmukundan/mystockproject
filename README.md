# Stock Watchlist App

A two-workspace monorepo for stock market analysis with FastAPI backend and React frontend.

## Features

### Backend (FastAPI)
- **FastAPI** with SQLAlchemy ORM and SQLite database
- **APScheduler** for periodic market data updates
- **yfinance** integration for real-time stock data
- **pandas** for data processing and CSV/XLSX parsing
- Symbol validation against Nasdaq directory
- Rule engine with tokenizer/parser/evaluator for SMA, EMA, crosses_above/below
- RESTful API with `/api/watchlists/upload` endpoint
- Comprehensive unit tests

### Frontend (React + Vite)
- **React 18** with TypeScript and Vite
- **Tailwind CSS** for styling
- **lightweight-charts** for OHLC candlestick charts
- Chart overlay API for horizontal lines (entry/exit) and markers
- CSV upload UI with schema preview and validation
- Responsive design with Heroicons

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)

### Using Docker Compose (Recommended)
```bash
# Start both backend and frontend
docker compose up

# Backend will be available at http://localhost:8000
# Frontend will be available at http://localhost:3000
```

### Local Development

#### Backend Setup
```bash
cd backend
pip install -r requirements.txt
make dev  # Starts uvicorn on port 8000
```

#### Frontend Setup
```bash
cd frontend
npm install
npm run dev  # Starts Vite dev server on port 3000
```

### Available Commands

#### Backend (Makefile targets)
```bash
make dev     # Start development server
make test    # Run unit tests
make seed    # Seed database with demo data
make build   # Build Docker image
```

#### Frontend (npm scripts)
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run test     # Run tests
npm run lint     # Run ESLint
```

## API Endpoints

- `GET /` - Root endpoint
- `GET /api/watchlists/` - List all watchlists
- `GET /api/watchlists/{id}` - Get specific watchlist
- `POST /api/watchlists/` - Create new watchlist
- `POST /api/watchlists/upload` - Upload CSV/XLSX file

## CSV Upload Format

Your CSV/XLSX file must contain a `symbol` column. Optional columns:
- `company_name` - Company name
- `entry_price` - Entry price level
- `target_price` - Target price level
- `stop_loss` - Stop loss price level

Example:
```csv
symbol,company_name,entry_price,target_price,stop_loss
AAPL,Apple Inc.,150.00,200.00,140.00
GOOGL,Alphabet Inc.,2500.00,3000.00,2300.00
MSFT,Microsoft Corporation,300.00,400.00,280.00
```

## Architecture

### Project Structure
```
mystockproject/
├── backend/
│   ├── app/
│   │   ├── api/           # API routes and schemas
│   │   ├── core/          # Database, config, scheduler
│   │   ├── models/        # SQLAlchemy models
│   │   ├── services/      # Business logic services
│   │   └── scripts/       # Utility scripts
│   ├── tests/             # Unit tests
│   ├── Dockerfile
│   ├── Makefile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API client
│   │   └── types/         # TypeScript types
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── package.json           # Monorepo root
```

### Database Models
- **Watchlist**: Container for stock symbols
- **WatchlistItem**: Individual stock entries with price levels
- **Rule**: Trading rules with expression-based evaluation

### Rule Engine
Supports technical analysis expressions:
- `SMA(20)` - Simple Moving Average
- `EMA(50)` - Exponential Moving Average  
- `price crosses_above SMA(20)` - Price crossover signals
- `price crosses_below EMA(50)` - Price crossunder signals

## Configuration

### Environment Variables
- `DATABASE_URL` - Database connection string (default: SQLite)
- `NASDAQ_API_KEY` - Optional Nasdaq API key
- `VITE_API_URL` - Frontend API URL (default: http://localhost:8000)

### Timezone
Default timezone is set to America/Chicago (-6 UTC).

## Testing

### Backend Tests
```bash
cd backend
make test  # Run pytest with coverage
```

Tests cover:
- Rule tokenizer and parser functionality
- SMA/EMA indicator calculations
- Rule evaluation with cross above/below logic
- API endpoint validation

### Frontend Tests
```bash
cd frontend
npm run test  # Run Vitest
```

## Production Deployment

1. Build images: `docker compose build`
2. Deploy with environment variables set
3. Use a production-grade database (PostgreSQL recommended)
4. Set up reverse proxy (nginx) for HTTPS
5. Configure monitoring and logging

## License

MIT License

## Technical Indicators & Jobs (Current Snapshot)

This section documents the technical indicator pipeline, the tables it writes to, how scheduled jobs are configured, and how retention (TTL) is applied. It will be expanded as we add more features.

### Data Sources and Merge
- historical_prices (src): Long-term OHLCV data by symbol/date. Used as the baseline history.
- prices_daily_ohlc (app): Schwab EOD OHLCV upserts by symbol/date. Treated as the primary source for "today".
- Merge rules for indicator compute (tail recompute):
  - Pull recent bars from both tables using a cutoff = latest_trade_date − (TECH_TAIL_DAYS + TECH_BUFFER_DAYS).
  - Concatenate; when duplicate dates exist, prefer prices_daily_ohlc over historical_prices.
  - Sort by date ASC; require a minimum tail length (TECH_MIN_ROWS, default 60) to compute stable indicators.

### Indicators (pandas‑ta)
- Core indicators computed per symbol: SMA(20/50/200), RSI(14), ATR(14), ADX(14), Donchian(20), MACD (12/26/9), avg_vol(20), 52‑week high (252)
- Derived (screener) fields: distance_to_52w_high, rel_volume, sma_slope

### Technical Tables
- technical_daily
  - PK: (symbol, date)
  - Contains core indicators and inputs (close, volume, SMA/RSI/ATR/ADX/Donchian/MACD/avg_vol/high_252)
  - No derived screener fields; they can be computed on demand from these inputs
  - Today’s row is upserted (idempotent) each time the job runs

- technical_latest
  - PK: symbol
  - One row per symbol for the latest trade date
  - Includes both core and derived screener fields (distance_to_52w_high, rel_volume, sma_slope)
  - Optimized for fast “today-only” screening in the UI

### Tech Job Tracking Tables
- tech_jobs
  - One row per technical compute run (started_at, finished_at, status, latest_trade_date)
  - Counters: total_symbols, updated_symbols, daily_rows_upserted, latest_rows_upserted, errors

- tech_job_skips
  - Per‑symbol reasons for skipping in a run; reason in {'empty','short_tail','no_today'}
  - empty: no data in merge window; short_tail: insufficient rows (< TECH_MIN_ROWS); no_today: latest bar didn’t match latest_trade_date

- tech_job_successes
  - Per‑symbol success rows (symbol, date) for each run

- job_execution_status (shared)
  - Per job_name execution history with status, duration, and records_processed
  - For technical_compute, records_processed = updated_symbols

### Jobs & Scheduling
- market_data_refresh (interval)
  - Every 30 minutes (honors market-hours logic inside the job)

- nasdaq_universe_refresh (cron)
  - Sundays 08:00 America/Chicago
  - Populates/updates the symbols universe with filters (excludes test issues, warrants, SPAC units, rights, preferred/hybrid suffixes, specific class/test suffixes)

- eod_price_scan (cron)
  - Mon–Fri 17:30 America/Chicago
  - Pulls Schwab EOD OHLCV into prices_daily_ohlc, in batches with rate limiting
  - Fails fast if Schwab auth refresh fails to avoid flooding downstream errors

- technical_compute (cron & chained)
  - Mon–Fri 17:40 America/Chicago AND triggered automatically after eod_price_scan completes
  - Tail recompute from merged sources; writes to technical_daily and technical_latest
  - Logs per‑symbol errors, skips (with reason), and successes

### Retention (TTL)
- JobExecutionStatus: keep last 5 runs per job (prune_history)
- EOD scans: keep last 5 eod_scans and their eod_scan_errors (prune_eod_scans)
- Tech runs: keep last 5 tech_jobs and their tech_job_skips / tech_job_successes (prune_tech_jobs)
- A days‑based cleanup job also runs (job_ttl_cleanup.py) that deletes very old job data across tables

### UI Overview
- Job Settings
  - Configure jobs, enable/disable, view last run details
  - Run Now buttons for universe/market data/tech; live status for tech
  - Schwab Authentication card to start OAuth flow (refresh tokens expire every 7 days). If using Tailscale, run `tailscale serve --https=443 localhost:8003` before login so the callback can reach the app.

- Job Status
  - EOD Scans: progress, errors, retry failed, truncate prices_daily
  - Technical Compute: last runs with progress bars, updated/skips/errors counts; per‑run “View Skips”, “View Successes”, “View Errors” (loaded on demand)

### Schwab OAuth & Tokens
- Access tokens are short‑lived and automatically refreshed in memory
- Refresh tokens have a hard 7‑day expiry (Schwab policy). You must re‑authenticate weekly via the browser OAuth flow to obtain a new refresh token, then update SCHWAB_REFRESH_TOKEN in your environment and restart the backend

### Key Environment Variables
- SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, SCHWAB_REFRESH_TOKEN, SCHWAB_BASE_URL
- TECH_TAIL_DAYS (default 260), TECH_BUFFER_DAYS (default 10), TECH_MIN_ROWS (default 60)
- TIMEZONE configured to America/Chicago for job triggers (UI renders times in America/Chicago)

### Making Sense of the Technical Tables
- For fast “today” screens → technical_latest (has derived fields out of the box)
- For historical analysis/backtesting → technical_daily (one row per date per symbol)
- You can derive distance_to_52w_high, rel_volume, and sma_slope from technical_daily using its inputs; latest is kept as a convenience/performance cache
