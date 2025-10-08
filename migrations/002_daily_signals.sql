-- Migration 002: Daily signals, scores, and proposed trade levels
-- Run: psql $DB_DSN -f migrations/002_daily_signals.sql

BEGIN;

-- ============================================================================
-- Table: signals_daily_hist
-- Historical daily signal events (append-only)
-- Tracks all daily signals, trend scores, and proposed trade levels
-- ============================================================================
CREATE TABLE IF NOT EXISTS signals_daily_hist (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    date DATE NOT NULL,

    -- Signal flags (computed using LAG for crosses)
    sma20_cross_50_up BOOLEAN NOT NULL DEFAULT FALSE,
    price_above_200 BOOLEAN NOT NULL DEFAULT FALSE,
    rsi_cross_50_up BOOLEAN NOT NULL DEFAULT FALSE,
    macd_cross_up BOOLEAN NOT NULL DEFAULT FALSE,
    donch20_breakout BOOLEAN NOT NULL DEFAULT FALSE,
    high_tight_zone BOOLEAN NOT NULL DEFAULT FALSE,

    -- Daily trend score (0-55 points)
    -- Formula: 20*price_above_200 + 15*sma20_cross_50_up + 10*macd_cross_up + 10*donch20_breakout
    trend_score_d INTEGER NOT NULL DEFAULT 0,

    -- Proposed trade levels (populated if breakout criteria met)
    proposed_entry DECIMAL(12, 4),
    proposed_stop DECIMAL(12, 4),
    target1 DECIMAL(12, 4),
    target2 DECIMAL(12, 4),

    -- Risk/reward ratio
    risk_reward_ratio DECIMAL(8, 2),

    -- Daily notes (warning messages)
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT signals_daily_hist_symbol_date_unique UNIQUE (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_signals_daily_hist_symbol ON signals_daily_hist(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_daily_hist_date ON signals_daily_hist(date DESC);
CREATE INDEX IF NOT EXISTS idx_signals_daily_hist_symbol_date ON signals_daily_hist(symbol, date DESC);
CREATE INDEX IF NOT EXISTS idx_signals_daily_hist_trend_score ON signals_daily_hist(trend_score_d DESC);
CREATE INDEX IF NOT EXISTS idx_signals_daily_hist_breakout ON signals_daily_hist(donch20_breakout) WHERE donch20_breakout = TRUE;
CREATE INDEX IF NOT EXISTS idx_signals_daily_hist_macd_cross ON signals_daily_hist(macd_cross_up) WHERE macd_cross_up = TRUE;

COMMENT ON TABLE signals_daily_hist IS 'Historical daily signal events - append-only with ON CONFLICT updates';
COMMENT ON COLUMN signals_daily_hist.sma20_cross_50_up IS 'Yesterday SMA20 < SMA50 AND today SMA20 >= SMA50';
COMMENT ON COLUMN signals_daily_hist.price_above_200 IS 'Close > SMA200';
COMMENT ON COLUMN signals_daily_hist.rsi_cross_50_up IS 'Yesterday RSI14 < 50 AND today RSI14 >= 50';
COMMENT ON COLUMN signals_daily_hist.macd_cross_up IS 'Yesterday MACD <= MACD_signal AND today MACD > MACD_signal';
COMMENT ON COLUMN signals_daily_hist.donch20_breakout IS 'Close >= donch20_high AND ADX14 > 20';
COMMENT ON COLUMN signals_daily_hist.high_tight_zone IS 'Distance to 52w high <= 5% AND relative volume >= 1.5';
COMMENT ON COLUMN signals_daily_hist.trend_score_d IS 'Weighted score: 20*price_above_200 + 15*sma20_cross_50_up + 10*macd_cross_up + 10*donch20_breakout';
COMMENT ON COLUMN signals_daily_hist.proposed_entry IS 'GREATEST(close, donch20_high) if breakout conditions met';
COMMENT ON COLUMN signals_daily_hist.proposed_stop IS 'proposed_entry - 2*ATR14';
COMMENT ON COLUMN signals_daily_hist.target1 IS 'proposed_entry + 2*ATR14';
COMMENT ON COLUMN signals_daily_hist.target2 IS 'high_252 * 1.03 (NULL if no high_252)';
COMMENT ON COLUMN signals_daily_hist.notes IS 'Priority warning: ADX<15, weak volume, overbought, or NULL';

-- ============================================================================
-- Table: signals_daily_latest
-- Latest daily signals per symbol (for fast screener queries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS signals_daily_latest (
    symbol VARCHAR(20) PRIMARY KEY,
    date DATE NOT NULL,

    -- Signal flags
    sma20_cross_50_up BOOLEAN NOT NULL DEFAULT FALSE,
    price_above_200 BOOLEAN NOT NULL DEFAULT FALSE,
    rsi_cross_50_up BOOLEAN NOT NULL DEFAULT FALSE,
    macd_cross_up BOOLEAN NOT NULL DEFAULT FALSE,
    donch20_breakout BOOLEAN NOT NULL DEFAULT FALSE,
    high_tight_zone BOOLEAN NOT NULL DEFAULT FALSE,

    -- Daily trend score
    trend_score_d INTEGER NOT NULL DEFAULT 0,

    -- Proposed trade levels
    proposed_entry DECIMAL(12, 4),
    proposed_stop DECIMAL(12, 4),
    target1 DECIMAL(12, 4),
    target2 DECIMAL(12, 4),

    -- Risk/reward
    risk_reward_ratio DECIMAL(8, 2),

    -- Notes
    notes TEXT,

    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_daily_latest_date ON signals_daily_latest(date DESC);
CREATE INDEX IF NOT EXISTS idx_signals_daily_latest_trend_score ON signals_daily_latest(trend_score_d DESC);
CREATE INDEX IF NOT EXISTS idx_signals_daily_latest_breakout ON signals_daily_latest(donch20_breakout) WHERE donch20_breakout = TRUE;
CREATE INDEX IF NOT EXISTS idx_signals_daily_latest_price_above_200 ON signals_daily_latest(price_above_200) WHERE price_above_200 = TRUE;
CREATE INDEX IF NOT EXISTS idx_signals_daily_latest_entry ON signals_daily_latest(proposed_entry) WHERE proposed_entry IS NOT NULL;

COMMENT ON TABLE signals_daily_latest IS 'Latest daily signals per symbol - upserted from hist for fast screener access';

COMMIT;

-- ============================================================================
-- Verification queries
-- ============================================================================
-- Run after migration:
-- SELECT COUNT(*) FROM signals_daily_hist;
-- SELECT COUNT(*) FROM signals_daily_latest;
-- SELECT * FROM signals_daily_latest WHERE donch20_breakout = TRUE LIMIT 10;
-- SELECT * FROM signals_daily_latest WHERE trend_score_d >= 40 ORDER BY trend_score_d DESC LIMIT 10;
