-- Migration 003: Performance indexes for screener queries
-- Run: psql $DB_DSN -f migrations/003_indexes.sql

BEGIN;

-- ============================================================================
-- Indexes on technical_latest for common screener filters
-- ============================================================================

-- Price range filters
CREATE INDEX IF NOT EXISTS idx_technical_latest_close_range
    ON technical_latest(close) WHERE close > 0;

-- Volume filters
CREATE INDEX IF NOT EXISTS idx_technical_latest_avg_vol
    ON technical_latest(avg_vol20) WHERE avg_vol20 > 0;

CREATE INDEX IF NOT EXISTS idx_technical_latest_rel_volume
    ON technical_latest(rel_volume) WHERE rel_volume > 0;

-- Distance to 52-week high filter
CREATE INDEX IF NOT EXISTS idx_technical_latest_52w_high_distance
    ON technical_latest(distance_to_52w_high)
    WHERE distance_to_52w_high IS NOT NULL;

-- Price above 200 SMA (common filter)
CREATE INDEX IF NOT EXISTS idx_technical_latest_above_200
    ON technical_latest(symbol, close, sma200)
    WHERE close > sma200;

-- SMA bull stack (SMA20 > SMA50 > SMA200)
CREATE INDEX IF NOT EXISTS idx_technical_latest_sma_stack
    ON technical_latest(symbol)
    WHERE sma20 > sma50 AND sma50 > sma200;

-- Composite index for price + volume filters
CREATE INDEX IF NOT EXISTS idx_technical_latest_price_vol_composite
    ON technical_latest(close, avg_vol20, rel_volume)
    WHERE close > 0 AND avg_vol20 > 0;

-- ============================================================================
-- Indexes on signals_daily_latest for signal-based filters
-- ============================================================================

-- MACD cross up filter
CREATE INDEX IF NOT EXISTS idx_signals_daily_macd_cross
    ON signals_daily_latest(symbol, trend_score_d)
    WHERE macd_cross_up = TRUE;

-- SMA20/50 cross up filter
CREATE INDEX IF NOT EXISTS idx_signals_daily_sma_cross
    ON signals_daily_latest(symbol, trend_score_d)
    WHERE sma20_cross_50_up = TRUE;

-- Donchian breakout filter
CREATE INDEX IF NOT EXISTS idx_signals_daily_donch_breakout
    ON signals_daily_latest(symbol, trend_score_d)
    WHERE donch20_breakout = TRUE;

-- Price above 200 filter
CREATE INDEX IF NOT EXISTS idx_signals_daily_above_200
    ON signals_daily_latest(symbol, trend_score_d)
    WHERE price_above_200 = TRUE;

-- High tight zone filter
CREATE INDEX IF NOT EXISTS idx_signals_daily_htz
    ON signals_daily_latest(symbol, trend_score_d)
    WHERE high_tight_zone = TRUE;

-- Multiple signals composite (common combination)
CREATE INDEX IF NOT EXISTS idx_signals_daily_multi_signal_composite
    ON signals_daily_latest(donch20_breakout, macd_cross_up, price_above_200, trend_score_d)
    WHERE trend_score_d >= 30;

-- Trade setups (has entry levels)
CREATE INDEX IF NOT EXISTS idx_signals_daily_has_setup
    ON signals_daily_latest(symbol, trend_score_d, risk_reward_ratio)
    WHERE proposed_entry IS NOT NULL;

-- ============================================================================
-- Indexes on weekly_signals_latest for weekly filters
-- ============================================================================

-- Weekly strong filter (close_above_30w AND stack_10_30_40)
CREATE INDEX IF NOT EXISTS idx_weekly_signals_strong
    ON weekly_signals_latest(symbol, trend_score_w)
    WHERE close_above_30w = TRUE AND stack_10_30_40 = TRUE;

-- Weekly SMA stack filter
CREATE INDEX IF NOT EXISTS idx_weekly_signals_stack
    ON weekly_signals_latest(symbol, trend_score_w)
    WHERE stack_10_30_40 = TRUE;

-- Weekly close above 30w
CREATE INDEX IF NOT EXISTS idx_weekly_signals_above_30w
    ON weekly_signals_latest(symbol, trend_score_w)
    WHERE close_above_30w = TRUE;

-- Weekly MACD cross
CREATE INDEX IF NOT EXISTS idx_weekly_signals_macd_cross
    ON weekly_signals_latest(symbol, trend_score_w)
    WHERE macd_w_cross_up = TRUE;

-- Weekly Donchian breakout
CREATE INDEX IF NOT EXISTS idx_weekly_signals_donch_breakout
    ON weekly_signals_latest(symbol, trend_score_w)
    WHERE donch20w_breakout = TRUE;

-- High weekly trend score
CREATE INDEX IF NOT EXISTS idx_weekly_signals_high_score
    ON weekly_signals_latest(trend_score_w DESC, symbol)
    WHERE trend_score_w >= 40;

-- ============================================================================
-- Indexes on technical_weekly_latest for weekly technical filters
-- ============================================================================

-- Weekly volume filter
CREATE INDEX IF NOT EXISTS idx_technical_weekly_latest_volume
    ON technical_weekly_latest(avg_vol10w)
    WHERE avg_vol10w > 0;

-- Weekly 52w high distance
CREATE INDEX IF NOT EXISTS idx_technical_weekly_latest_52w_distance
    ON technical_weekly_latest(distance_to_52w_high_w)
    WHERE distance_to_52w_high_w IS NOT NULL;

-- ============================================================================
-- Composite indexes for common screener query patterns
-- ============================================================================

-- Pattern 1: Price + Volume + Above 200
CREATE INDEX IF NOT EXISTS idx_screener_pattern_price_vol_200
    ON technical_latest(close, avg_vol20)
    WHERE close > sma200 AND avg_vol20 > 100000;

-- Pattern 2: Breakout candidates (near 52w high + volume)
CREATE INDEX IF NOT EXISTS idx_screener_pattern_breakout_candidates
    ON technical_latest(distance_to_52w_high, rel_volume)
    WHERE distance_to_52w_high >= -0.10 AND rel_volume >= 1.0;

-- Pattern 3: Daily + Weekly alignment
-- (This is a functional composite - handled by view filters)

COMMIT;

-- ============================================================================
-- Index Statistics and Verification
-- ============================================================================

-- View all indexes on screener-related tables
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     indexdef
-- FROM pg_indexes
-- WHERE tablename IN (
--     'technical_latest',
--     'signals_daily_latest',
--     'weekly_signals_latest',
--     'technical_weekly_latest'
-- )
-- ORDER BY tablename, indexname;

-- Check index sizes
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) AS index_size
-- FROM pg_indexes
-- WHERE tablename IN (
--     'technical_latest',
--     'signals_daily_latest',
--     'weekly_signals_latest',
--     'technical_weekly_latest'
-- )
-- ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;

-- Analyze tables for query planner
ANALYZE technical_latest;
ANALYZE signals_daily_latest;
ANALYZE weekly_signals_latest;
ANALYZE technical_weekly_latest;

-- ============================================================================
-- Performance Notes
-- ============================================================================
-- 1. All indexes use partial indexes (WHERE clauses) to reduce size
-- 2. Composite indexes prioritize most selective columns first
-- 3. ANALYZE ensures query planner has fresh statistics
-- 4. Index names follow pattern: idx_{table}_{columns}_{condition}
-- 5. Regularly run VACUUM ANALYZE on these tables after bulk updates
