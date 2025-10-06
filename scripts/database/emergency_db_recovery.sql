-- Emergency database recovery script
-- Use this when PostgreSQL disk usage is at 100%

-- 1. Check current database activity
SELECT
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '30 seconds'
ORDER BY duration DESC;

-- 2. Kill long-running queries (over 2 minutes)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '2 minutes'
AND state = 'active'
AND query NOT LIKE '%pg_stat_activity%';

-- 3. Check table sizes to identify problems
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC
LIMIT 10;

-- 4. Check for missing indexes on large tables
SELECT
    t.tablename,
    indexname,
    c.reltuples AS num_rows,
    pg_size_pretty(pg_relation_size(quote_ident(t.tablename)::regclass)) as table_size
FROM pg_tables t
LEFT JOIN pg_class c ON c.relname = t.tablename
LEFT JOIN pg_indexes i ON i.tablename = t.tablename
WHERE t.schemaname = 'public'
AND c.reltuples > 1000
ORDER BY c.reltuples DESC;

-- 5. Vacuum and analyze critical tables
VACUUM ANALYZE prices_daily_ohlc;
VACUUM ANALYZE historical_prices;
VACUUM ANALYZE prices_realtime_cache;