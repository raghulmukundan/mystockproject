-- Critical database indexes to fix performance issues
-- Run this to fix the 100% disk usage problem

-- Index for daily OHLC prices (most commonly queried)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_ohlc_symbol_date
ON prices_daily_ohlc (symbol, date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_ohlc_date
ON prices_daily_ohlc (date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_ohlc_symbol
ON prices_daily_ohlc (symbol);

-- Index for historical prices (if used)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_historical_symbol_date
ON historical_prices (symbol, date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_historical_date
ON historical_prices (date DESC);

-- Index for realtime price cache
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_realtime_cache_symbol
ON prices_realtime_cache (symbol);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_realtime_cache_updated
ON prices_realtime_cache (updated_at DESC);

-- Composite indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_ohlc_symbol_date_range
ON prices_daily_ohlc (symbol, date DESC)
WHERE date >= CURRENT_DATE - INTERVAL '1 year';

-- Show index creation progress
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('prices_daily_ohlc', 'historical_prices', 'prices_realtime_cache')
ORDER BY tablename, indexname;