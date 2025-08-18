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