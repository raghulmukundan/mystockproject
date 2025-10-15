# Bearish Signals Implementation Progress

## ✅ COMPLETED

### 1. Database Schema ✅
- Added `below_30w_ma`, `macd_w_cross_down`, `stack_broken`, `rsi14w_lt_50` to `weekly_signals_hist` and `weekly_signals_latest`
- Added `below_200_sma`, `macd_cross_down`, `rsi_cross_50_down` to `signals_daily_hist` and `signals_daily_latest`
- Migration file: `sql/add_bearish_signals_migration.sql`
- **Status**: Migration ran successfully

### 2. Weekly Signals SQL ✅
- File: `sql/weekly_signals_upsert.sql`
- Added bearish signal calculations:
  - `below_30w_ma` = close < sma30w
  - `stack_broken` = NOT(sma10w > sma30w > sma40w)
  - `macd_w_cross_down` = MACD crossed below signal
  - `rsi14w_lt_50` = RSI < 50
- Updated INSERT/UPSERT statements for both hist and latest tables

### 3. Daily Signals SQL ✅
- File: `sql/daily_signals_upsert.sql`
- Added bearish signal calculations:
  - `below_200_sma` = close < sma200
  - `macd_cross_down` = MACD crossed below signal
  - `rsi_cross_50_down` = RSI crossed below 50
- Updated INSERT/UPSERT statements for both hist and latest tables

## 🔄 IN PROGRESS / TODO

### 4. Screener View Update (Required)
The `screener_view` or `screener_latest` view needs to be updated to join bearish signals.

**Action Required:**
```sql
-- Find the screener view definition
-- Add joins to weekly_signals_latest and signals_daily_latest
-- Include bearish signal columns in SELECT
```

### 5. Backend API Update (Required)
File: `api/app.py`

**Changes Needed:**
- Screener endpoint should return bearish signal fields
- The view should already have them after step 4

### 6. Frontend TypeScript Types (Required)
File: `frontend/src/services/screenerApi.ts`

**Add to ScreenerResult interface:**
```typescript
// Weekly bearish signals
below_30w_ma: boolean | null
macd_w_cross_down: boolean | null
stack_broken: boolean | null
rsi14w_lt_50: boolean | null

// Daily bearish signals
below_200_sma: boolean | null
macd_cross_down: boolean | null
rsi_cross_50_down: boolean | null
```

### 7. Watchlist UI - Warning Badges (Required)
File: `frontend/src/pages/Watchlists.tsx`

**Add after bullish signals (around line 1310):**
```tsx
{/* BEARISH WARNING BADGES */}
{screener?.below_30w_ma && (
  <span className="text-xs font-semibold text-orange-600 cursor-help"
    title="Below 30w MA: Stock dropped below 30-week moving average support">
    ⚠️ Below 30w
  </span>
)}
{screener?.stack_broken && (
  <span className="text-xs font-semibold text-orange-600 cursor-help"
    title="Stack Broken: SMA alignment broke down">
    📉 Stack Lost
  </span>
)}
{screener?.macd_w_cross_down && (
  <span className="text-xs font-semibold text-red-600 cursor-help"
    title="MACD Cross Down: Weekly MACD turned bearish">
    🔴 MACD↓W
  </span>
)}
{screener?.below_200_sma && (
  <span className="text-xs font-semibold text-red-600 cursor-help"
    title="Below 200 SMA: Price dropped below 200-day moving average">
    ❌ Below 200
  </span>
)}
{screener?.macd_cross_down && (
  <span className="text-xs font-semibold text-red-600 cursor-help"
    title="MACD Cross Down: Daily MACD turned bearish">
    🔴 MACD↓
  </span>
)}
```

### 8. Weakening Filter (Required)
File: `frontend/src/pages/Watchlists.tsx`

**Add to Signals filter section (around line 900):**
```tsx
<button
  key="weakening"
  onClick={() => {
    setFilterSignals(prev =>
      prev.includes('weakening') ? prev.filter(s => s !== 'weakening') : [...prev, 'weakening']
    )
  }}
  className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
    filterSignals.includes('weakening')
      ? 'bg-red-500 text-white'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`}
>
  ⚠️ Weakening
</button>
```

**Update filter logic (around line 370):**
```typescript
// In getFilteredAndSortedItems function
if (filterSignals.includes('weakening')) {
  const isWeakening =
    screener.below_30w_ma ||
    screener.stack_broken ||
    screener.macd_w_cross_down ||
    screener.rsi14w_lt_50 ||
    screener.below_200_sma ||
    screener.macd_cross_down ||
    screener.rsi_cross_50_down
  if (!isWeakening) return false
}
```

## Testing Steps

After completing remaining items:

1. **Run weekly analysis** to populate bearish signals:
   ```bash
   docker exec -i jobs-service python -m app.services.weekly_bars_job
   ```

2. **Verify database has bearish data:**
   ```sql
   SELECT symbol, below_30w_ma, stack_broken, macd_w_cross_down
   FROM weekly_signals_latest
   WHERE below_30w_ma = TRUE OR stack_broken = TRUE
   LIMIT 10;
   ```

3. **Test frontend:**
   - Open watchlist
   - Look for warning badges (⚠️, 📉, 🔴, ❌)
   - Click "⚠️ Weakening" filter
   - Verify only weakening stocks show

## Benefits Once Complete

- ✅ Know immediately when watchlist stocks turn bearish
- ✅ Get visual warnings after each weekly analysis
- ✅ One-click filter to review all troubled positions
- ✅ Make informed exit decisions based on bearish signals
- ✅ Catch trend changes early before major losses

## Estimated Time to Complete
- Screener view update: 10 min
- Backend API: 5 min (likely auto-works after view update)
- Frontend types: 5 min
- Warning badges UI: 15 min
- Weakening filter: 10 min
- Testing: 15 min

**Total: ~1 hour remaining**
