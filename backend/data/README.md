# Database Files

## Currently Used
- **`stock_watchlist_v2.db`** - ✅ **ACTIVE DATABASE** (clean, working)
  - Contains: 4 watchlists, 33 current prices, all required tables
  - Status: Healthy, no corruption

## Corrupted/Legacy Files (IGNORE - DO NOT USE)
- **`stock_watchlist.db`** - ❌ Corrupted legacy database (locked by Windows)
- **`stock_watchlist.db-shm`** - ❌ SQLite shared memory (locked by Windows)
- **`stock_watchlist.db-wal`** - ❌ SQLite write-ahead log (locked by Windows)

**Note:** These files are locked by Windows and cannot be removed, but they don't interfere with the application since it uses the v2 database.

## Successfully Removed Backups
- ✅ `data.corrupted.backup/` directory - Removed
- ✅ `stock_watchlist_backup_20250906.db` - Removed  
- ✅ All other backup files - Cleaned up

## Database Schema Version: v2
- Added historical_prices table for OHLCV data
- Added import tracking tables (import_jobs, import_errors, etc.)
- Added EOD scan tracking tables
- All existing data preserved from v1

## Notes
- **Only use `stock_watchlist_v2.db`** for all operations
- Legacy files are harmless but locked by Windows
- Future schema changes should use proper migrations (Alembic)