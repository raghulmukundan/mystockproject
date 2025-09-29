-- Performance Monitoring Dashboard for MyStock Project
-- Run these queries in pgAdmin to monitor database health

-- 1. Database size and table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;

-- 2. Active connections and queries
SELECT
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state,
    client_addr
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;

-- 3. Most expensive queries (if pg_stat_statements is enabled)
SELECT
    query,
    calls,
    total_time,
    mean_time,
    rows
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- 4. Index usage statistics
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- 5. Table statistics (rows, inserts, updates, deletes)
SELECT
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- 6. Check if our performance indexes exist
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('prices_daily_ohlc', 'historical_prices', 'prices_realtime_cache')
ORDER BY tablename, indexname;

-- 7. Slow query log (queries taking > 1 second)
SELECT
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '1 second'
AND state = 'active'
ORDER BY duration DESC;