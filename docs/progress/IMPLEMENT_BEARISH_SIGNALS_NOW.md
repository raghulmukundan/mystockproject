# Quick Bearish Signals Implementation

## TL;DR
You want to know when stocks in your watchlist turn bearish. Here's the fastest way to implement it:

## Step 1: Run Database Migration (5 min)

```bash
# Copy the SQL migration into Docker
docker cp sql/add_bearish_signals_migration.sql postgres:/tmp/

# Run it
docker exec -i postgres psql -U stockuser -d stockwatchlist -f /tmp/add_bearish_signals_migration.sql
```

This adds columns for bearish signals to your database.

## Step 2: What Changed

The system will now track these **warning signs**:

### Weekly (from weekly analysis):
- ⚠️ **Below 30w MA** - Stock dropped below 30-week support
- 📉 **Stack Broken** - Moving averages no longer aligned bullishly
- 🔴 **MACD↓W** - Weekly MACD turned bearish
- **RSI < 50** - Weekly momentum weakened

### Daily:
- ❌ **Below 200** - Lost 200-day moving average support
- 🔴 **MACD↓** - Daily MACD crossed down
- **RSI↓50** - RSI dropped below 50

## Step 3: How to Use

After running weekly analysis:

1. **Open your watchlist**
2. **Look for warning badges** (⚠️, 📉, 🔴, ❌) in red/orange
3. **Click "⚠️ Weakening" filter** to see all troubled stocks at once
4. **Review and decide** whether to:
   - Set tighter stop losses
   - Reduce position size
   - Exit the position
   - Wait and monitor

## Example

Before: `AAPL` showing `🐂 Bull` `S:45` `D:50`
After weekly run: `AAPL` showing `⚠️ Below 30w` `📉 Stack Lost`

**Action**: Time to review AAPL - trend weakening!

## Files Created

1. `sql/add_bearish_signals_migration.sql` - Database migration
2. `docs/BEARISH_SIGNALS_IMPLEMENTATION.md` - Full technical details
3. This file - Quick start guide

## What's Next?

The SQL migration is ready. The remaining work is:
1. Update SQL signal computation files (weekly_signals_upsert.sql, daily_signals_upsert.sql)
2. Update backend API to return bearish signals
3. Update frontend to display warning badges
4. Add "Weakening" filter

This is a 2-3 hour implementation that will give you the early warning system you need!

## Why This Matters

Right now, you have no way to know when:
- Bull signal is lost
- Stack breaks down
- MACD turns negative
- Stock drops below key moving averages

With this, you'll get **automatic alerts** after every weekly analysis showing which watchlist stocks need attention.
