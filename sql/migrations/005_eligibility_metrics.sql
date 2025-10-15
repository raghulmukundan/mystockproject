-- ============================================================================
-- Add Eligibility Metrics Migration
-- Adds derived fields to technical_latest for trend gating and tie-breaking
-- ============================================================================

BEGIN;

-- Step 1: Add eligibility columns to technical_latest
ALTER TABLE technical_latest
ADD COLUMN IF NOT EXISTS avg_dollar_vol NUMERIC,
ADD COLUMN IF NOT EXISTS atr_pct NUMERIC,
ADD COLUMN IF NOT EXISTS near_breakout BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS macd_hist_trending_up BOOLEAN DEFAULT FALSE;

-- Step 2: Create indexes for screener performance
CREATE INDEX IF NOT EXISTS idx_technical_latest_avg_dollar_vol
    ON technical_latest(avg_dollar_vol)
    WHERE avg_dollar_vol IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_technical_latest_atr_pct
    ON technical_latest(atr_pct)
    WHERE atr_pct IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_technical_latest_near_breakout
    ON technical_latest(near_breakout)
    WHERE near_breakout = TRUE;

-- Step 3: Create composite index for common eligibility filters
CREATE INDEX IF NOT EXISTS idx_technical_latest_eligibility
    ON technical_latest(avg_dollar_vol, atr_pct, near_breakout)
    WHERE avg_dollar_vol IS NOT NULL AND atr_pct IS NOT NULL;

COMMIT;

-- ============================================================================
-- Verification
-- ============================================================================

-- Check columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'technical_latest'
AND column_name IN ('avg_dollar_vol', 'atr_pct', 'near_breakout', 'macd_hist_trending_up')
ORDER BY column_name;

-- Check indexes created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'technical_latest'
AND indexname LIKE '%eligibility%' OR indexname LIKE '%avg_dollar%' OR indexname LIKE '%atr_pct%'
ORDER BY indexname;
