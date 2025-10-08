# Stock Screener - Quick Start Guide

Get the stock screener running in minutes!

---

## Prerequisites

- Docker and docker-compose installed
- PostgreSQL database with data (historical_prices, current_prices, technical_daily)

---

## Step 1: Run Migrations

```bash
cd C:\Users\raghu\OneDrive\Documents\mystockproject

# Set DB connection
set DB_DSN=postgresql+psycopg://postgres:postgres123@localhost:5432/mystockproject

# Run screener migrations (view + indexes)
make migrate-screener
```

**Expected output:**
```
Running screener view and indexes migrations...
CREATE VIEW
CREATE INDEX
...
✅ Screener migrations complete
```

---

## Step 2: Build & Start Screener API

```bash
# Build and start screener API service
docker-compose up -d --build screener-api

# Check logs
docker-compose logs -f screener-api
```

**Expected output:**
```
screener-api_1  | INFO:     Started server process
screener-api_1  | INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## Step 3: Restart Backend (to load proxy)

```bash
# Restart backend to pick up new screener router
docker-compose restart backend

# Check backend logs
docker-compose logs -f backend | grep screener
```

---

## Step 4: Restart Frontend

```bash
# Restart frontend to pick up new components
docker-compose restart frontend

# Check frontend logs
docker-compose logs -f frontend
```

---

## Step 5: Access Screener

1. Open browser: http://localhost:3000
2. Click **"Screener"** tab (2nd tab after Overview)
3. See stock results load automatically
4. Try filters:
   - Toggle "Above 200 SMA" chip
   - Set "Min Daily Score" to 30
   - Change sort to "Daily Score (High to Low)"
   - See results update

---

## Verify Everything Works

### Test 1: Basic Query
```bash
curl "http://localhost:8000/api/screener?pageSize=5"
```

**Expected:** JSON with results array and pagination info

### Test 2: With Filters
```bash
curl "http://localhost:8000/api/screener?aboveSMA200=true&minTrendScoreD=30"
```

**Expected:** JSON with filtered results

### Test 3: Health Check
```bash
curl "http://localhost:8000/api/screener/health"
```

**Expected:** `{"status": "healthy"}`

---

## Troubleshooting

### Issue: "No results found"

**Check if data exists:**
```bash
psql $DB_DSN -c "SELECT COUNT(*) FROM screener_latest;"
```

**Expected:** Non-zero count

**If zero:**
1. Check if technical_latest has data: `SELECT COUNT(*) FROM technical_latest;`
2. Run technical compute job to populate data

### Issue: "Screener service unavailable"

**Check screener API is running:**
```bash
docker-compose ps screener-api
```

**Expected:** State = Up

**If not running:**
```bash
docker-compose up -d screener-api
docker-compose logs screener-api
```

### Issue: "Proxy error"

**Check backend can reach screener API:**
```bash
docker-compose exec backend curl http://screener-api:8000/health
```

**Expected:** `{"status": "healthy"}`

**If timeout:**
- Verify both services are on same network: `docker network inspect mystockproject_app-network`
- Check screener-api service name in docker-compose.yml

### Issue: "View does not exist"

**Run migrations:**
```bash
make migrate-screener
```

### Issue: Frontend shows blank screen

**Check browser console:**
- Open DevTools (F12)
- Look for errors in Console tab
- Check Network tab for failed requests

**Check frontend logs:**
```bash
docker-compose logs -f frontend
```

---

## Quick Reference

### Services & Ports
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **Screener API**: http://localhost:8001 (internal)
- **PostgreSQL**: localhost:5432

### Important URLs
- **Screener Tab**: http://localhost:3000 (click "Screener")
- **API Docs (Backend)**: http://localhost:8000/docs
- **API Docs (Screener)**: http://localhost:8001/docs

### Makefile Commands
```bash
make migrate-screener  # Run screener migrations
make verify            # Verify data counts
```

### Docker Commands
```bash
docker-compose up -d screener-api          # Start screener API
docker-compose restart backend frontend    # Restart backend + frontend
docker-compose logs -f screener-api        # View logs
docker-compose down                        # Stop all services
```

### Database Queries
```bash
# Check screener view
psql $DB_DSN -c "SELECT symbol, combined_score FROM screener_latest ORDER BY combined_score DESC LIMIT 10;"

# Check indexes
psql $DB_DSN -c "SELECT tablename, indexname FROM pg_indexes WHERE tablename LIKE '%signals%' OR tablename LIKE '%technical%';"
```

---

## Next Steps

1. **Populate Data** (if needed):
   ```bash
   # Run weekly pipeline (first time)
   make weekly-all

   # Run daily signals
   make daily-signals
   ```

2. **Explore Filters**:
   - Try different filter combinations
   - Use signal chips (Above 200 SMA, SMA Bull Stack, etc.)
   - Experiment with sort options

3. **Advanced Usage**:
   - Read `SCREENER_API_README.md` for all filter options
   - Read `PRODUCTION_BACKEND_COMPLETE.md` for architecture
   - Read `SCREENER_UI_COMPLETE.md` for UI features

---

## Summary

You should now have:
✅ Screener API running on port 8001
✅ Backend proxying requests to screener API
✅ Frontend with beautiful screener UI
✅ Database with screener_latest view and indexes
✅ Working filters, sorting, and pagination

**Enjoy screening stocks!** 🚀
