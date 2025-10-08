-- Migration 001: Weekly bars, technicals, and signals
-- Run: psql $DB_DSN -f migrations/001_weekly.sql

BEGIN;

-- ============================================================================
-- Table: weekly_bars
-- Stores weekly OHLCV data aggregated from daily bars
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_bars (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    week_end DATE NOT NULL,  -- Friday or last trading day of week
    open DECIMAL(12, 4) NOT NULL,
    high DECIMAL(12, 4) NOT NULL,
    low DECIMAL(12, 4) NOT NULL,
    close DECIMAL(12, 4) NOT NULL,
    volume BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT weekly_bars_symbol_week_unique UNIQUE (symbol, week_end)
);

CREATE INDEX IF NOT EXISTS idx_weekly_bars_symbol ON weekly_bars(symbol);
CREATE INDEX IF NOT EXISTS idx_weekly_bars_week_end ON weekly_bars(week_end DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_bars_symbol_week ON weekly_bars(symbol, week_end DESC);

COMMENT ON TABLE weekly_bars IS 'Weekly OHLCV bars aggregated from daily data';
COMMENT ON COLUMN weekly_bars.week_end IS 'Friday or last trading day of that week';

-- ============================================================================
-- Table: technical_weekly
-- Stores weekly technical indicators computed from weekly_bars
-- ============================================================================
CREATE TABLE IF NOT EXISTS technical_weekly (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    week_end DATE NOT NULL,
    close DECIMAL(12, 4) NOT NULL,
    volume BIGINT NOT NULL,

    -- Moving averages
    sma10w DECIMAL(12, 4),
    sma30w DECIMAL(12, 4),
    sma40w DECIMAL(12, 4),

    -- Momentum indicators
    rsi14w DECIMAL(8, 4),
    adx14w DECIMAL(8, 4),
    atr14w DECIMAL(12, 4),

    -- Donchian channels
    donch20w_high DECIMAL(12, 4),
    donch20w_low DECIMAL(12, 4),

    -- MACD
    macd_w DECIMAL(12, 6),
    macd_signal_w DECIMAL(12, 6),
    macd_hist_w DECIMAL(12, 6),

    -- Volume
    avg_vol10w BIGINT,

    -- 52-week high tracking
    high_52w DECIMAL(12, 4),
    distance_to_52w_high_w DECIMAL(8, 6),  -- (close - high_52w) / high_52w

    -- Trend slope
    sma_w_slope DECIMAL(12, 6),  -- Slope of sma30w

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT technical_weekly_symbol_week_unique UNIQUE (symbol, week_end)
);

CREATE INDEX IF NOT EXISTS idx_technical_weekly_symbol ON technical_weekly(symbol);
CREATE INDEX IF NOT EXISTS idx_technical_weekly_week_end ON technical_weekly(week_end DESC);
CREATE INDEX IF NOT EXISTS idx_technical_weekly_symbol_week ON technical_weekly(symbol, week_end DESC);

COMMENT ON TABLE technical_weekly IS 'Weekly technical indicators computed from weekly bars';

-- ============================================================================
-- Materialized View: technical_weekly_latest
-- Latest weekly technical data per symbol (fast lookup)
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS technical_weekly_latest AS
SELECT DISTINCT ON (symbol)
    symbol,
    week_end,
    close,
    volume,
    sma10w,
    sma30w,
    sma40w,
    rsi14w,
    adx14w,
    atr14w,
    donch20w_high,
    donch20w_low,
    macd_w,
    macd_signal_w,
    macd_hist_w,
    avg_vol10w,
    high_52w,
    distance_to_52w_high_w,
    sma_w_slope,
    updated_at
FROM technical_weekly
ORDER BY symbol, week_end DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_technical_weekly_latest_symbol
    ON technical_weekly_latest(symbol);
CREATE INDEX IF NOT EXISTS idx_technical_weekly_latest_week_end
    ON technical_weekly_latest(week_end DESC);

COMMENT ON MATERIALIZED VIEW technical_weekly_latest IS 'Latest weekly technical per symbol - refresh after weekly compute';

-- ============================================================================
-- Table: weekly_signals_hist
-- Historical weekly signal events (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_signals_hist (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    week_end DATE NOT NULL,

    -- Signal flags
    stack_10_30_40 BOOLEAN NOT NULL DEFAULT FALSE,
    close_above_30w BOOLEAN NOT NULL DEFAULT FALSE,
    donch20w_breakout BOOLEAN NOT NULL DEFAULT FALSE,
    macd_w_cross_up BOOLEAN NOT NULL DEFAULT FALSE,
    rsi14w_gt_50 BOOLEAN NOT NULL DEFAULT FALSE,

    -- Composite score
    trend_score_w INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT weekly_signals_hist_symbol_week_unique UNIQUE (symbol, week_end)
);

CREATE INDEX IF NOT EXISTS idx_weekly_signals_hist_symbol ON weekly_signals_hist(symbol);
CREATE INDEX IF NOT EXISTS idx_weekly_signals_hist_week_end ON weekly_signals_hist(week_end DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_signals_hist_score ON weekly_signals_hist(trend_score_w DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_signals_hist_symbol_week ON weekly_signals_hist(symbol, week_end DESC);

COMMENT ON TABLE weekly_signals_hist IS 'Historical weekly signal events - append-only';
COMMENT ON COLUMN weekly_signals_hist.trend_score_w IS '20*close_above_30w + 15*stack_10_30_40 + 15*macd_w_cross_up + 10*donch20w_breakout + 10*rsi14w_gt_50';

-- ============================================================================
-- Table: weekly_signals_latest
-- Latest weekly signals per symbol (for fast screener queries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS weekly_signals_latest (
    symbol VARCHAR(20) PRIMARY KEY,
    week_end DATE NOT NULL,

    -- Signal flags
    stack_10_30_40 BOOLEAN NOT NULL DEFAULT FALSE,
    close_above_30w BOOLEAN NOT NULL DEFAULT FALSE,
    donch20w_breakout BOOLEAN NOT NULL DEFAULT FALSE,
    macd_w_cross_up BOOLEAN NOT NULL DEFAULT FALSE,
    rsi14w_gt_50 BOOLEAN NOT NULL DEFAULT FALSE,

    -- Composite score
    trend_score_w INTEGER NOT NULL DEFAULT 0,

    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_signals_latest_week_end ON weekly_signals_latest(week_end DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_signals_latest_score ON weekly_signals_latest(trend_score_w DESC);

COMMENT ON TABLE weekly_signals_latest IS 'Latest weekly signals per symbol - upserted from hist';

COMMIT;

-- ============================================================================
-- Verification queries
-- ============================================================================
-- Run after migration:
-- SELECT COUNT(*) FROM weekly_bars;
-- SELECT COUNT(*) FROM technical_weekly;
-- SELECT COUNT(*) FROM weekly_signals_hist;
-- SELECT COUNT(*) FROM weekly_signals_latest;
-- SELECT * FROM technical_weekly_latest LIMIT 5;
