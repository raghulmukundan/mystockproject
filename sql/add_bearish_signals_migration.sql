-- ============================================================================
-- Add Bearish Signals Migration
-- Adds bearish/weakening indicators to track when stocks turn bearish
-- Run this inside Docker: docker exec -i postgres psql -U stockuser -d stockwatchlist < add_bearish_signals_migration.sql
-- ============================================================================

BEGIN;

-- Step 1: Add bearish signal columns to weekly_signals_hist
ALTER TABLE weekly_signals_hist
ADD COLUMN IF NOT EXISTS below_30w_ma BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS macd_w_cross_down BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stack_broken BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rsi14w_lt_50 BOOLEAN DEFAULT FALSE;

-- Step 2: Add bearish signal columns to weekly_signals_latest
ALTER TABLE weekly_signals_latest
ADD COLUMN IF NOT EXISTS below_30w_ma BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS macd_w_cross_down BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS stack_broken BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rsi14w_lt_50 BOOLEAN DEFAULT FALSE;

-- Step 3: Add bearish signal columns to signals_daily_hist
ALTER TABLE signals_daily_hist
ADD COLUMN IF NOT EXISTS below_200_sma BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS macd_cross_down BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rsi_cross_50_down BOOLEAN DEFAULT FALSE;

-- Step 4: Add bearish signal columns to signals_daily_latest
ALTER TABLE signals_daily_latest
ADD COLUMN IF NOT EXISTS below_200_sma BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS macd_cross_down BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rsi_cross_50_down BOOLEAN DEFAULT FALSE;

COMMIT;

-- Note: The computed columns will be added in the updated weekly_signals_upsert.sql
-- and daily_signals_upsert.sql scripts
