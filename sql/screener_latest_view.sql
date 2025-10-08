-- ============================================================================
-- Screener Latest View
-- Unified view joining technical_latest, signals_daily_latest,
-- technical_weekly_latest, and weekly_signals_latest
-- Surfaces all indicators, signals, scores, and trade setups for UI
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS screener_latest CASCADE;

CREATE VIEW screener_latest AS
SELECT
    -- Symbol and dates
    td.symbol,
    td.date AS daily_date,
    tw.week_end AS weekly_date,

    -- Price and volume (daily)
    td.close,
    td.volume,
    td.avg_vol20,
    td.rel_volume,

    -- Daily moving averages
    td.sma20,
    td.sma50,
    td.sma200,

    -- Daily momentum
    td.rsi14,
    td.adx14,
    td.atr14,

    -- Daily channels
    td.donch20_high,
    td.donch20_low,

    -- Daily MACD
    td.macd,
    td.macd_signal,
    td.macd_hist,

    -- Daily 52-week tracking
    td.high_252,
    td.distance_to_52w_high,

    -- Daily trend
    td.sma_slope,

    -- ========================================================================
    -- DAILY SIGNALS (from signals_daily_latest)
    -- ========================================================================
    sd.sma20_cross_50_up,
    sd.price_above_200,
    sd.rsi_cross_50_up,
    sd.macd_cross_up,
    sd.donch20_breakout,
    sd.high_tight_zone,

    -- Daily trend score (0-55)
    sd.trend_score_d,

    -- Proposed trade levels (daily)
    sd.proposed_entry,
    sd.proposed_stop,
    sd.target1,
    sd.target2,
    sd.risk_reward_ratio,
    sd.notes AS daily_notes,

    -- ========================================================================
    -- WEEKLY TECHNICALS (from technical_weekly_latest)
    -- ========================================================================
    tw.sma10w,
    tw.sma30w,
    tw.sma40w,
    tw.rsi14w,
    tw.adx14w,
    tw.atr14w,
    tw.donch20w_high,
    tw.donch20w_low,
    tw.macd_w,
    tw.macd_signal_w,
    tw.macd_hist_w,
    tw.avg_vol10w,
    tw.high_52w,
    tw.distance_to_52w_high_w,
    tw.sma_w_slope,

    -- ========================================================================
    -- WEEKLY SIGNALS (from weekly_signals_latest)
    -- ========================================================================
    ws.stack_10_30_40,
    ws.close_above_30w,
    ws.donch20w_breakout,
    ws.macd_w_cross_up,
    ws.rsi14w_gt_50,

    -- Weekly trend score (0-70)
    ws.trend_score_w,

    -- ========================================================================
    -- DERIVED FIELDS (for common filters)
    -- ========================================================================

    -- SMA bull stack (daily)
    CASE
        WHEN td.sma20 > td.sma50 AND td.sma50 > td.sma200 THEN TRUE
        ELSE FALSE
    END AS sma_bull_stack,

    -- Weekly strong (common filter)
    CASE
        WHEN ws.close_above_30w = TRUE AND ws.stack_10_30_40 = TRUE THEN TRUE
        ELSE FALSE
    END AS weekly_strong,

    -- Combined trend score (daily + weekly)
    COALESCE(sd.trend_score_d, 0) + COALESCE(ws.trend_score_w, 0) AS combined_score,

    -- Distance from entry (if proposed entry exists)
    CASE
        WHEN sd.proposed_entry IS NOT NULL
        THEN ((sd.proposed_entry - td.close) / td.close) * 100
        ELSE NULL
    END AS distance_from_entry_pct,

    -- % from 52-week high
    CASE
        WHEN td.distance_to_52w_high IS NOT NULL
        THEN td.distance_to_52w_high * 100
        ELSE NULL
    END AS pct_from_52w_high

FROM technical_latest td

-- Join daily signals (left join - may not exist yet)
LEFT JOIN signals_daily_latest sd ON td.symbol = sd.symbol

-- Join weekly technicals (left join - weekly may not exist for all symbols)
LEFT JOIN technical_weekly_latest tw ON td.symbol = tw.symbol

-- Join weekly signals (left join - may not exist yet)
LEFT JOIN weekly_signals_latest ws ON td.symbol = ws.symbol

WHERE td.close IS NOT NULL
  AND td.close > 0;

COMMIT;

-- ============================================================================
-- Create indexes on underlying tables for screener performance
-- (These are in addition to existing indexes from migrations)
-- ============================================================================

-- Indexes already exist from migrations 001 and 002, but adding composite ones
-- for common screener filter combinations

CREATE INDEX IF NOT EXISTS idx_technical_latest_close_volume
    ON technical_latest(close, avg_vol20) WHERE close > 0;

CREATE INDEX IF NOT EXISTS idx_technical_latest_sma_above_200
    ON technical_latest(symbol) WHERE close > sma200;

CREATE INDEX IF NOT EXISTS idx_signals_daily_latest_multi_signal
    ON signals_daily_latest(donch20_breakout, macd_cross_up, price_above_200)
    WHERE trend_score_d >= 30;

CREATE INDEX IF NOT EXISTS idx_weekly_signals_latest_strong
    ON weekly_signals_latest(close_above_30w, stack_10_30_40)
    WHERE trend_score_w >= 40;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Count of symbols in screener
-- SELECT COUNT(*) FROM screener_latest;

-- Sample data
-- SELECT * FROM screener_latest LIMIT 10;

-- Symbols with daily breakouts
-- SELECT symbol, trend_score_d, donch20_breakout, proposed_entry, target1
-- FROM screener_latest
-- WHERE donch20_breakout = TRUE
-- ORDER BY trend_score_d DESC
-- LIMIT 10;

-- Symbols with strong weekly + daily alignment
-- SELECT symbol, combined_score, trend_score_d, trend_score_w, weekly_strong, sma_bull_stack
-- FROM screener_latest
-- WHERE weekly_strong = TRUE AND sma_bull_stack = TRUE
-- ORDER BY combined_score DESC
-- LIMIT 10;

-- High-scoring setups with trade levels
-- SELECT symbol, combined_score, proposed_entry, proposed_stop, target1, risk_reward_ratio
-- FROM screener_latest
-- WHERE proposed_entry IS NOT NULL
-- ORDER BY combined_score DESC
-- LIMIT 10;
