-- ============================================================================
-- Daily Signals Computation
-- Computes daily signal flags using LAG for cross detection
-- Calculates trend scores and proposed trade levels
-- Upserts into signals_daily_hist and signals_daily_latest
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Get latest date from technical_daily
-- ============================================================================
DO $$
DECLARE
    latest_date TEXT;
BEGIN
    SELECT MAX(date) INTO latest_date FROM technical_daily;

    IF latest_date IS NULL THEN
        RAISE EXCEPTION 'No data in technical_daily table';
    END IF;

    RAISE NOTICE 'Processing daily signals for date: %', latest_date;
END $$;

-- ============================================================================
-- Step 2: Compute daily signals using LAG for crosses
-- ============================================================================
WITH latest_technicals AS (
    -- Get last 2 days of data per symbol for LAG comparisons
    SELECT
        symbol,
        date,
        close,
        volume,
        sma20,
        sma50,
        sma200,
        rsi14,
        adx14,
        atr14,
        donch20_high,
        donch20_low,
        macd,
        macd_signal,
        macd_hist,
        avg_vol20,
        high_252,
        -- Compute distance_to_52w_high: (close - high_252) / high_252
        CASE WHEN high_252 > 0 THEN (close - high_252) / high_252 ELSE NULL END AS distance_to_52w_high,
        -- Compute rel_volume: volume / avg_vol20
        CASE WHEN avg_vol20 > 0 THEN volume::numeric / avg_vol20 ELSE NULL END AS rel_volume,
        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
    FROM technical_daily
    WHERE date::date >= (SELECT MAX(date::date) - INTERVAL '5 days' FROM technical_daily)
),
with_lag AS (
    SELECT
        symbol,
        date,
        close,
        volume,
        sma20,
        sma50,
        sma200,
        rsi14,
        adx14,
        atr14,
        donch20_high,
        donch20_low,
        macd,
        macd_signal,
        macd_hist,
        avg_vol20,
        high_252,
        distance_to_52w_high,
        rel_volume,

        -- LAG values for cross detection
        LAG(sma20) OVER (PARTITION BY symbol ORDER BY date) AS prev_sma20,
        LAG(sma50) OVER (PARTITION BY symbol ORDER BY date) AS prev_sma50,
        LAG(rsi14) OVER (PARTITION BY symbol ORDER BY date) AS prev_rsi14,
        LAG(macd) OVER (PARTITION BY symbol ORDER BY date) AS prev_macd,
        LAG(macd_signal) OVER (PARTITION BY symbol ORDER BY date) AS prev_macd_signal

    FROM latest_technicals
    WHERE rn <= 2  -- Only need last 2 days
),
signals_computed AS (
    SELECT
        symbol,
        date,
        close,
        sma200,
        rsi14,
        adx14,
        atr14,
        donch20_high,
        high_252,
        distance_to_52w_high,
        rel_volume,

        -- Signal 1: SMA20 cross 50 up
        CASE
            WHEN sma20 IS NOT NULL
                AND sma50 IS NOT NULL
                AND prev_sma20 IS NOT NULL
                AND prev_sma50 IS NOT NULL
                AND prev_sma20 < prev_sma50
                AND sma20 >= sma50
            THEN TRUE
            ELSE FALSE
        END AS sma20_cross_50_up,

        -- Signal 2: Price above 200 SMA
        CASE
            WHEN sma200 IS NOT NULL AND close > sma200 THEN TRUE
            ELSE FALSE
        END AS price_above_200,

        -- Signal 3: RSI cross 50 up
        CASE
            WHEN rsi14 IS NOT NULL
                AND prev_rsi14 IS NOT NULL
                AND prev_rsi14 < 50
                AND rsi14 >= 50
            THEN TRUE
            ELSE FALSE
        END AS rsi_cross_50_up,

        -- Signal 4: MACD cross up
        CASE
            WHEN macd IS NOT NULL
                AND macd_signal IS NOT NULL
                AND prev_macd IS NOT NULL
                AND prev_macd_signal IS NOT NULL
                AND prev_macd <= prev_macd_signal
                AND macd > macd_signal
            THEN TRUE
            ELSE FALSE
        END AS macd_cross_up,

        -- Signal 5: Donchian 20 breakout (with ADX > 20 filter)
        CASE
            WHEN donch20_high IS NOT NULL
                AND adx14 IS NOT NULL
                AND close >= donch20_high
                AND adx14 > 20
            THEN TRUE
            ELSE FALSE
        END AS donch20_breakout,

        -- Signal 6: High tight zone (near 52w high with strong volume)
        CASE
            WHEN distance_to_52w_high IS NOT NULL
                AND rel_volume IS NOT NULL
                AND distance_to_52w_high <= 0.05
                AND distance_to_52w_high >= -0.05
                AND rel_volume >= 1.5
            THEN TRUE
            ELSE FALSE
        END AS high_tight_zone,

        -- Store these for trade level calculations
        sma20,
        sma50,
        macd,
        macd_signal

    FROM with_lag
    WHERE date = (SELECT MAX(date) FROM technical_daily)::text  -- Only process latest date
),
scores_and_levels AS (
    SELECT
        symbol,
        date,

        -- Signal flags
        sma20_cross_50_up,
        price_above_200,
        rsi_cross_50_up,
        macd_cross_up,
        donch20_breakout,
        high_tight_zone,

        -- Daily trend score
        -- Formula: 20*price_above_200 + 15*sma20_cross_50_up + 10*macd_cross_up + 10*donch20_breakout
        (
            (CASE WHEN price_above_200 THEN 20 ELSE 0 END) +
            (CASE WHEN sma20_cross_50_up THEN 15 ELSE 0 END) +
            (CASE WHEN macd_cross_up THEN 10 ELSE 0 END) +
            (CASE WHEN donch20_breakout THEN 10 ELSE 0 END)
        ) AS trend_score_d,

        -- Proposed trade levels
        -- Condition: donch20_breakout OR (sma20_cross_50_up AND price_above_200 AND macd_cross_up)
        CASE
            WHEN (donch20_breakout OR (sma20_cross_50_up AND price_above_200 AND macd_cross_up))
                AND close > 0 AND close < 100000000
            THEN LEAST(GREATEST(close, COALESCE(donch20_high, close)), 99999999.9999)
            ELSE NULL
        END AS proposed_entry,

        -- Stop loss: entry - 2*ATR
        CASE
            WHEN (donch20_breakout OR (sma20_cross_50_up AND price_above_200 AND macd_cross_up))
                AND close > 0 AND close < 100000000 AND atr14 > 0
            THEN LEAST(GREATEST(close, COALESCE(donch20_high, close)) - (2 * atr14), 99999999.9999)
            ELSE NULL
        END AS proposed_stop,

        -- Target 1: entry + 2*ATR
        CASE
            WHEN (donch20_breakout OR (sma20_cross_50_up AND price_above_200 AND macd_cross_up))
                AND close > 0 AND close < 100000000 AND atr14 > 0
            THEN LEAST(GREATEST(close, COALESCE(donch20_high, close)) + (2 * atr14), 99999999.9999)
            ELSE NULL
        END AS target1,

        -- Target 2: 52w high * 1.03
        CASE
            WHEN (donch20_breakout OR (sma20_cross_50_up AND price_above_200 AND macd_cross_up))
                AND high_252 IS NOT NULL AND high_252 > 0 AND high_252 < 100000000
            THEN LEAST(high_252 * 1.03, 99999999.9999)
            ELSE NULL
        END AS target2,

        -- Daily notes (priority order)
        CASE
            WHEN adx14 < 15 THEN 'Watch-out: low trend strength (ADX<15)'
            WHEN rel_volume < 0.8 THEN 'Watch-out: weak volume'
            WHEN rsi14 > 75 THEN 'Watch-out: overbought'
            ELSE NULL
        END AS notes,

        -- Store for risk/reward calculation
        close,
        atr14,
        adx14,
        rel_volume,
        rsi14

    FROM signals_computed
),
final_with_rr AS (
    SELECT
        *,
        -- Risk/Reward ratio
        CASE
            WHEN proposed_entry IS NOT NULL
                AND proposed_stop IS NOT NULL
                AND (proposed_entry - proposed_stop) > 0
                AND target1 IS NOT NULL
            THEN (target1 - proposed_entry) / (proposed_entry - proposed_stop)
            ELSE NULL
        END AS risk_reward_ratio
    FROM scores_and_levels
)

-- ============================================================================
-- Step 3: Upsert into signals_daily_hist (append-only with updates)
-- ============================================================================
INSERT INTO signals_daily_hist (
    symbol,
    date,
    sma20_cross_50_up,
    price_above_200,
    rsi_cross_50_up,
    macd_cross_up,
    donch20_breakout,
    high_tight_zone,
    trend_score_d,
    proposed_entry,
    proposed_stop,
    target1,
    target2,
    risk_reward_ratio,
    notes,
    updated_at
)
SELECT
    symbol,
    date::date,
    sma20_cross_50_up,
    price_above_200,
    rsi_cross_50_up,
    macd_cross_up,
    donch20_breakout,
    high_tight_zone,
    trend_score_d,
    proposed_entry,
    proposed_stop,
    target1,
    target2,
    risk_reward_ratio,
    notes,
    NOW()
FROM final_with_rr
ON CONFLICT (symbol, date)
DO UPDATE SET
    sma20_cross_50_up = EXCLUDED.sma20_cross_50_up,
    price_above_200 = EXCLUDED.price_above_200,
    rsi_cross_50_up = EXCLUDED.rsi_cross_50_up,
    macd_cross_up = EXCLUDED.macd_cross_up,
    donch20_breakout = EXCLUDED.donch20_breakout,
    high_tight_zone = EXCLUDED.high_tight_zone,
    trend_score_d = EXCLUDED.trend_score_d,
    proposed_entry = EXCLUDED.proposed_entry,
    proposed_stop = EXCLUDED.proposed_stop,
    target1 = EXCLUDED.target1,
    target2 = EXCLUDED.target2,
    risk_reward_ratio = EXCLUDED.risk_reward_ratio,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- ============================================================================
-- Step 4: Upsert latest signals per symbol into signals_daily_latest
-- ============================================================================
INSERT INTO signals_daily_latest (
    symbol,
    date,
    sma20_cross_50_up,
    price_above_200,
    rsi_cross_50_up,
    macd_cross_up,
    donch20_breakout,
    high_tight_zone,
    trend_score_d,
    proposed_entry,
    proposed_stop,
    target1,
    target2,
    risk_reward_ratio,
    notes,
    updated_at
)
SELECT DISTINCT ON (symbol)
    symbol,
    date,
    sma20_cross_50_up,
    price_above_200,
    rsi_cross_50_up,
    macd_cross_up,
    donch20_breakout,
    high_tight_zone,
    trend_score_d,
    proposed_entry,
    proposed_stop,
    target1,
    target2,
    risk_reward_ratio,
    notes,
    NOW()
FROM signals_daily_hist
ORDER BY symbol, date DESC
ON CONFLICT (symbol)
DO UPDATE SET
    date = EXCLUDED.date,
    sma20_cross_50_up = EXCLUDED.sma20_cross_50_up,
    price_above_200 = EXCLUDED.price_above_200,
    rsi_cross_50_up = EXCLUDED.rsi_cross_50_up,
    macd_cross_up = EXCLUDED.macd_cross_up,
    donch20_breakout = EXCLUDED.donch20_breakout,
    high_tight_zone = EXCLUDED.high_tight_zone,
    trend_score_d = EXCLUDED.trend_score_d,
    proposed_entry = EXCLUDED.proposed_entry,
    proposed_stop = EXCLUDED.proposed_stop,
    target1 = EXCLUDED.target1,
    target2 = EXCLUDED.target2,
    risk_reward_ratio = EXCLUDED.risk_reward_ratio,
    notes = EXCLUDED.notes,
    updated_at = NOW();

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Count of signals computed
SELECT COUNT(*) AS total_daily_signals FROM signals_daily_hist;

-- Latest signals count
SELECT COUNT(*) AS symbols_with_signals FROM signals_daily_latest;

-- % with strong trend (trend_score_d >= 40)
SELECT
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE trend_score_d >= 40) / NULLIF(COUNT(*), 0),
        2
    ) AS pct_strong_trend_daily
FROM signals_daily_latest;

-- Top 10 daily breakouts (by trend score)
SELECT
    symbol,
    date,
    trend_score_d,
    sma20_cross_50_up,
    price_above_200,
    macd_cross_up,
    donch20_breakout,
    high_tight_zone,
    proposed_entry,
    proposed_stop,
    target1,
    risk_reward_ratio,
    notes
FROM signals_daily_latest
ORDER BY trend_score_d DESC, symbol
LIMIT 10;

-- Active breakouts with trade setups
SELECT
    symbol,
    date,
    trend_score_d,
    donch20_breakout,
    proposed_entry,
    proposed_stop,
    target1,
    target2,
    risk_reward_ratio,
    notes
FROM signals_daily_latest
WHERE proposed_entry IS NOT NULL
ORDER BY trend_score_d DESC
LIMIT 10;

-- Distribution of trend scores
SELECT
    trend_score_d,
    COUNT(*) AS count
FROM signals_daily_latest
GROUP BY trend_score_d
ORDER BY trend_score_d DESC;
