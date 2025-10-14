# Bearish Signals Implementation Guide

## Overview
This document outlines the implementation of bearish/weakening signals to track when stocks in watchlists turn bearish after weekly analysis.

## Architecture

### 1. Database Changes

**New Columns Added:**

**weekly_signals_hist & weekly_signals_latest:**
- `below_30w_ma` BOOLEAN - Close dropped below 30-week MA (was bullish)
- `macd_w_cross_down` BOOLEAN - Weekly MACD crossed down
- `stack_broken` BOOLEAN - SMA stack broke down (was 10w > 30w > 40w)
- `rsi14w_lt_50` BOOLEAN - RSI dropped below 50

**daily_signals:**
- `below_200_sma` BOOLEAN - Price below 200-day SMA
- `macd_cross_down` BOOLEAN - Daily MACD crossed down
- `rsi_cross_50_down` BOOLEAN - RSI crossed below 50

### 2. Migration Steps

Run these commands in order:

```bash
# 1. Run the SQL migration to add columns
docker exec -i postgres psql -U stockuser -d stockwatchlist < sql/add_bearish_signals_migration.sql

# 2. Update the weekly signals computation
#    Update sql/weekly_signals_upsert.sql to include bearish calculations
#    (see updated file)

# 3. Update the daily signals computation
#    Update sql/daily_signals_upsert.sql to include bearish calculations
#    (see updated file)

# 4. Restart jobs service to pick up changes
docker-compose restart jobs-service

# 5. Run weekly analysis to populate bearish signals
# This will happen automatically on next scheduled run
```

### 3. Bearish Signal Logic

**Weekly Signals:**
1. `below_30w_ma` = TRUE when close < sma30w (opposite of close_above_30w)
2. `macd_w_cross_down` = TRUE when macd_w crosses below macd_signal_w
3. `stack_broken` = TRUE when NOT(sma10w > sma30w > sma40w)
4. `rsi14w_lt_50` = TRUE when rsi14w < 50

**Daily Signals:**
1. `below_200_sma` = TRUE when close < sma200 (opposite of price_above_200)
2. `macd_cross_down` = TRUE when macd crosses below signal
3. `rsi_cross_50_down` = TRUE when rsi crosses below 50

### 4. UI Changes

**Watchlist Display:**
- Show warning badges (⚠️, 📉, ❌, 🔴) for bearish signals
- Warning badges appear in red/orange colors
- Position after bullish signals for easy comparison

**Filter Section:**
- Add "⚠️ Weakening" filter button
- When clicked, shows only stocks with ANY bearish signal
- Color: Red/orange to indicate warning

**Warning Badge Examples:**
- ⚠️ Below 30w - Was above 30-week MA, now below
- 📉 Stack Lost - SMA stack broke down
- 🔴 MACD↓ - MACD crossed down
- ❌ Below 200 - Lost 200-day SMA support

### 5. Screener API Update

Update `api/app.py` screener endpoint to include:
- `below_30w_ma`
- `macd_w_cross_down`
- `stack_broken`
- `rsi14w_lt_50`
- `below_200_sma`
- `macd_cross_down`
- `rsi_cross_50_down`
- `is_weakening` (composite: ANY bearish signal present)

### 6. Frontend TypeScript Updates

Update `frontend/src/services/screenerApi.ts`:

```typescript
export interface ScreenerResult {
  // ... existing fields ...

  // Bearish signals
  below_30w_ma: boolean | null
  macd_w_cross_down: boolean | null
  stack_broken: boolean | null
  rsi14w_lt_50: boolean | null
  below_200_sma: boolean | null
  macd_cross_down: boolean | null
  rsi_cross_50_down: boolean | null
  is_weakening: boolean | null
}
```

## Benefits

1. **Early Warning System** - Know when stocks are weakening before major losses
2. **Automated Tracking** - No manual checking needed after weekly analysis
3. **Quick Filtering** - One-click filter to see all weakening stocks
4. **Visual Alerts** - Red/orange badges immediately draw attention
5. **Exit Strategy** - Clear signals when it's time to consider selling

## Next Steps After Implementation

1. Monitor watchlist after each weekly analysis run
2. Look for stocks with warning badges
3. Use "⚠️ Weakening" filter to review all troubled positions
4. Make informed decisions about which stocks to keep/sell
5. Adjust stop losses or exit positions showing multiple bearish signals

## Testing

After implementation, test by:
1. Running weekly analysis
2. Checking stocks that lost Bull signal (should show ⚠️ Below 30w)
3. Verifying filter works correctly
4. Ensuring warning badges display properly
5. Confirming multiple bearish signals stack correctly
