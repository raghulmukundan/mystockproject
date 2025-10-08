-- ============================================================================
-- Weekly Signals Computation
-- Computes weekly signal flags and trend scores from technical_weekly
-- Uses LAG for MACD cross detection
-- Upserts into weekly_signals_hist and weekly_signals_latest
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Compute weekly signals using LAG for crosses
-- ============================================================================
WITH ranked_weekly AS (
    SELECT
        symbol,
        week_end,
        close,
        sma10w,
        sma30w,
        sma40w,
        rsi14w,
        donch20w_high,
        macd_w,
        macd_signal_w,
        LAG(macd_w) OVER (PARTITION BY symbol ORDER BY week_end) AS prev_macd_w,
        LAG(macd_signal_w) OVER (PARTITION BY symbol ORDER BY week_end) AS prev_macd_signal_w,
        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY week_end DESC) AS rn
    FROM technical_weekly
    WHERE week_end >= CURRENT_DATE - INTERVAL '2 years'  -- Last 2 years
),
signals_computed AS (
    SELECT
        symbol,
        week_end,

        -- Signal: SMA Stack (10w > 30w > 40w)
        CASE
            WHEN sma10w > sma30w AND sma30w > sma40w THEN TRUE
            ELSE FALSE
        END AS stack_10_30_40,

        -- Signal: Close above SMA30w
        CASE
            WHEN close > sma30w THEN TRUE
            ELSE FALSE
        END AS close_above_30w,

        -- Signal: Donchian 20w breakout (close >= donch20w_high)
        CASE
            WHEN close >= donch20w_high THEN TRUE
            ELSE FALSE
        END AS donch20w_breakout,

        -- Signal: MACD cross up (current macd_w > macd_signal_w AND prev macd_w <= prev macd_signal_w)
        CASE
            WHEN macd_w IS NOT NULL
                AND macd_signal_w IS NOT NULL
                AND prev_macd_w IS NOT NULL
                AND prev_macd_signal_w IS NOT NULL
                AND macd_w > macd_signal_w
                AND prev_macd_w <= prev_macd_signal_w
            THEN TRUE
            ELSE FALSE
        END AS macd_w_cross_up,

        -- Signal: RSI14w > 50
        CASE
            WHEN rsi14w > 50 THEN TRUE
            ELSE FALSE
        END AS rsi14w_gt_50

    FROM ranked_weekly
),
scores_computed AS (
    SELECT
        symbol,
        week_end,
        stack_10_30_40,
        close_above_30w,
        donch20w_breakout,
        macd_w_cross_up,
        rsi14w_gt_50,

        -- Trend Score: 20*close_above_30w + 15*stack_10_30_40 + 15*macd_w_cross_up + 10*donch20w_breakout + 10*rsi14w_gt_50
        (
            (CASE WHEN close_above_30w THEN 20 ELSE 0 END) +
            (CASE WHEN stack_10_30_40 THEN 15 ELSE 0 END) +
            (CASE WHEN macd_w_cross_up THEN 15 ELSE 0 END) +
            (CASE WHEN donch20w_breakout THEN 10 ELSE 0 END) +
            (CASE WHEN rsi14w_gt_50 THEN 10 ELSE 0 END)
        ) AS trend_score_w

    FROM signals_computed
)

-- ============================================================================
-- Step 2: Upsert into weekly_signals_hist (append-only with conflict handling)
-- ============================================================================
INSERT INTO weekly_signals_hist (
    symbol,
    week_end,
    stack_10_30_40,
    close_above_30w,
    donch20w_breakout,
    macd_w_cross_up,
    rsi14w_gt_50,
    trend_score_w,
    updated_at
)
SELECT
    symbol,
    week_end,
    stack_10_30_40,
    close_above_30w,
    donch20w_breakout,
    macd_w_cross_up,
    rsi14w_gt_50,
    trend_score_w,
    NOW()
FROM scores_computed
ON CONFLICT (symbol, week_end)
DO UPDATE SET
    stack_10_30_40 = EXCLUDED.stack_10_30_40,
    close_above_30w = EXCLUDED.close_above_30w,
    donch20w_breakout = EXCLUDED.donch20w_breakout,
    macd_w_cross_up = EXCLUDED.macd_w_cross_up,
    rsi14w_gt_50 = EXCLUDED.rsi14w_gt_50,
    trend_score_w = EXCLUDED.trend_score_w,
    updated_at = NOW();

-- ============================================================================
-- Step 3: Upsert latest signals per symbol into weekly_signals_latest
-- ============================================================================
INSERT INTO weekly_signals_latest (
    symbol,
    week_end,
    stack_10_30_40,
    close_above_30w,
    donch20w_breakout,
    macd_w_cross_up,
    rsi14w_gt_50,
    trend_score_w,
    updated_at
)
SELECT DISTINCT ON (symbol)
    symbol,
    week_end,
    stack_10_30_40,
    close_above_30w,
    donch20w_breakout,
    macd_w_cross_up,
    rsi14w_gt_50,
    trend_score_w,
    NOW()
FROM weekly_signals_hist
ORDER BY symbol, week_end DESC
ON CONFLICT (symbol)
DO UPDATE SET
    week_end = EXCLUDED.week_end,
    stack_10_30_40 = EXCLUDED.stack_10_30_40,
    close_above_30w = EXCLUDED.close_above_30w,
    donch20w_breakout = EXCLUDED.donch20w_breakout,
    macd_w_cross_up = EXCLUDED.macd_w_cross_up,
    rsi14w_gt_50 = EXCLUDED.rsi14w_gt_50,
    trend_score_w = EXCLUDED.trend_score_w,
    updated_at = NOW();

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Count of signals computed
SELECT COUNT(*) AS total_signals FROM weekly_signals_hist;

-- Count of latest signals
SELECT COUNT(*) AS symbols_with_signals FROM weekly_signals_latest;

-- % of symbols with strong weekly trend (trend_score_w >= 40)
SELECT
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE trend_score_w >= 40) / NULLIF(COUNT(*), 0),
        2
    ) AS pct_strong_trend
FROM weekly_signals_latest;

-- Top 10 weekly leaders by trend score
SELECT
    symbol,
    week_end,
    trend_score_w,
    stack_10_30_40,
    close_above_30w,
    macd_w_cross_up,
    donch20w_breakout,
    rsi14w_gt_50
FROM weekly_signals_latest
ORDER BY trend_score_w DESC, symbol
LIMIT 10;

-- Distribution of trend scores
SELECT
    trend_score_w,
    COUNT(*) AS count
FROM weekly_signals_latest
GROUP BY trend_score_w
ORDER BY trend_score_w DESC;
