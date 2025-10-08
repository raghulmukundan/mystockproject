# Project Structure

Clean, organized structure for the stock analytics application.

```
mystockproject/
├── api/                          # Screener FastAPI service
│   ├── app.py                    # Main screener API
│   ├── requirements.txt          # Python dependencies
│   └── Dockerfile                # API container config
│
├── backend/                      # Main FastAPI backend
│   ├── app/                      # Application code
│   │   ├── api/                  # API endpoints
│   │   │   ├── screener.py       # Screener proxy
│   │   │   ├── daily_movers.py   # Daily movers API
│   │   │   ├── technical.py      # Technical indicators
│   │   │   └── ...
│   │   ├── core/                 # Core utilities
│   │   └── models/               # Database models
│   ├── requirements.txt          # Python dependencies
│   └── Dockerfile                # Backend container
│
├── frontend/                     # React frontend
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── StockScreener.tsx # Screener UI
│   │   │   ├── DailyMoversHeatmap.tsx
│   │   │   └── ...
│   │   ├── pages/                # Page components
│   │   │   └── Dashboard.tsx     # Main dashboard
│   │   └── services/             # API clients
│   │       ├── screenerApi.ts    # Screener API client
│   │       └── ...
│   ├── package.json              # Node dependencies
│   └── Dockerfile                # Frontend container
│
├── jobs-service/                 # Background jobs service
│   ├── app/
│   │   ├── services/             # Job implementations
│   │   └── core/                 # Job scheduling
│   └── Dockerfile
│
├── external-apis/                # External API integrations
│   ├── app/                      # Schwab, Finnhub APIs
│   └── Dockerfile
│
├── migrations/                   # Database migrations
│   ├── 001_weekly.sql            # Weekly tables
│   ├── 002_daily_signals.sql     # Daily signals tables
│   └── 003_indexes.sql           # Performance indexes
│
├── sql/                          # SQL scripts
│   ├── screener_latest_view.sql  # Screener view
│   ├── daily_signals_upsert.sql  # Daily signals computation
│   └── weekly_signals_upsert.sql # Weekly signals computation
│
├── jobs/                         # Standalone job scripts
│   ├── weekly_bars_etl.py        # Weekly aggregation
│   ├── weekly_technicals_etl.py  # Weekly indicators
│   └── daily_signals_job.py      # Daily signals runner
│
├── docs/                         # Documentation
│   ├── PRODUCTION_BACKEND_COMPLETE.md
│   ├── SCREENER_API_README.md
│   ├── SCREENER_UI_COMPLETE.md
│   └── SCREENER_QUICKSTART.md
│
├── docker-compose.yml            # All services orchestration
├── Makefile                      # Commands for all operations
├── .env                          # Environment configuration
└── README.md                     # Project overview
```

## Key Directories

### `/api` - Screener Service
Standalone FastAPI service for stock screening with comprehensive filters.
- Runs on port 8001 (internal)
- Queries screener_latest view
- Handles sorting, filtering, pagination

### `/backend` - Main Backend
Primary FastAPI backend handling most API requests.
- Runs on port 8000
- Proxies requests to screener service
- Manages daily movers, technical data, watchlists

### `/frontend` - React UI
Vite + React + TypeScript + Tailwind CSS.
- Runs on port 3000
- Dashboard with Overview, Screener, Movers tabs
- Beautiful UI with filters and charts

### `/jobs-service` - Background Jobs
Scheduled jobs for EOD data, technical computation, daily movers.
- Runs on port 8004
- APScheduler for cron-like scheduling

### `/external-apis` - API Gateway
Wrapper for Schwab and Finnhub APIs.
- Runs on port 8003
- OAuth handling, rate limiting

### `/migrations` - Database Migrations
SQL migration files for schema changes.
- Idempotent (safe to re-run)
- Versioned (001, 002, 003, ...)

### `/sql` - SQL Scripts
Complex SQL queries and views.
- Upsert scripts for signals computation
- View definitions

### `/jobs` - Standalone Jobs
Python scripts for analytics pipeline.
- Run via Makefile or manually
- Generate weekly/daily analytics

### `/docs` - Documentation
Comprehensive guides and references.
- Architecture documentation
- API references
- Quick start guides

## Quick Commands

```bash
# Docker operations
make start-docker      # Start all services
make stop-docker       # Stop all services
make logs              # View logs
make status            # Check status

# Analytics pipeline
make migrate           # Run weekly migrations
make migrate-daily     # Run daily migrations
make migrate-screener  # Run screener migrations
make daily-signals     # Compute daily signals
make weekly-all        # Run weekly pipeline
make verify            # Verify data counts

# Validation
make validate          # Validate configs
make help              # Show all commands
```

## Services & Ports

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 3000 | React UI |
| Backend | 8000 | Main API |
| Screener API | 8001 | Screener service (internal) |
| External APIs | 8003 | Schwab/Finnhub gateway |
| Jobs Service | 8004 | Background jobs |
| PostgreSQL | 5432 | Database |
| PgAdmin | 8080 | DB admin UI |

## Data Flow

```
User → Frontend (3000)
         ↓
       Backend (8000)
         ↓
     ┌───┴───┬─────────┬──────────┐
     ↓       ↓         ↓          ↓
Screener  External  Jobs     PostgreSQL
 (8001)    (8003)  (8004)      (5432)
```

## Clean Structure Benefits

✅ **Organized**: Clear separation of concerns
✅ **Documented**: All docs in `/docs`
✅ **Maintainable**: Easy to find components
✅ **Scalable**: Services can be deployed independently
✅ **Professional**: Industry-standard layout
