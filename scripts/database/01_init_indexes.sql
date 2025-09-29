-- Auto-run database optimization when PostgreSQL container starts
-- This prevents the performance issues we encountered

\echo 'Creating optimized indexes for stock price queries...'

-- Only create indexes if tables exist
DO $$
BEGIN
    -- Check if prices_daily_ohlc table exists and create indexes
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'prices_daily_ohlc') THEN
        -- Index for daily OHLC prices (most commonly queried)
        CREATE INDEX IF NOT EXISTS idx_daily_ohlc_symbol_date
        ON prices_daily_ohlc (symbol, date DESC);

        CREATE INDEX IF NOT EXISTS idx_daily_ohlc_date
        ON prices_daily_ohlc (date DESC);

        CREATE INDEX IF NOT EXISTS idx_daily_ohlc_symbol
        ON prices_daily_ohlc (symbol);

        RAISE NOTICE 'Created indexes for prices_daily_ohlc table';
    END IF;

    -- Check if historical_prices table exists and create indexes
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'historical_prices') THEN
        CREATE INDEX IF NOT EXISTS idx_historical_symbol_date
        ON historical_prices (symbol, date DESC);

        CREATE INDEX IF NOT EXISTS idx_historical_date
        ON historical_prices (date DESC);

        RAISE NOTICE 'Created indexes for historical_prices table';
    END IF;

    -- Check if prices_realtime_cache table exists and create indexes
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'prices_realtime_cache') THEN
        CREATE INDEX IF NOT EXISTS idx_realtime_cache_symbol
        ON prices_realtime_cache (symbol);

        CREATE INDEX IF NOT EXISTS idx_realtime_cache_updated
        ON prices_realtime_cache (updated_at DESC);

        RAISE NOTICE 'Created indexes for prices_realtime_cache table';
    END IF;
END
$$;

\echo 'Database optimization complete!'