# Technical Indicators and Scoring System

## Daily Technical Indicators (technical_daily)

### Price & Volume
- **close** - Daily closing price
- **volume** - Daily trading volume (shares)
- **avg_vol20** - 20-day average volume
- **high_252** - 52-week high (252 trading days)

### Moving Averages
- **sma20** - 20-day Simple Moving Average
- **sma50** - 50-day Simple Moving Average
- **sma200** - 200-day Simple Moving Average

### Momentum Indicators
- **rsi14** - 14-day Relative Strength Index (0-100)
- **adx14** - 14-day Average Directional Index (trend strength)
- **atr14** - 14-day Average True Range (volatility)

### MACD (Moving Average Convergence Divergence)
- **macd** - MACD line
- **macd_signal** - Signal line
- **macd_hist** - MACD histogram (macd - signal)

### Channels
- **donch20_high** - 20-day Donchian Channel high
- **donch20_low** - 20-day Donchian Channel low

### Derived Metrics
- **distance_to_52w_high** - (close - high_252) / high_252 (percentage)
- **rel_volume** - volume / avg_vol20 (relative volume)

---

## Weekly Technical Indicators (technical_weekly)

### Price & Volume
- **close** - Weekly closing price
- **volume** - Weekly volume
- **avg_vol10w** - 10-week average volume
- **high_52w** - 52-week high

### Moving Averages
- **sma10w** - 10-week Simple Moving Average
- **sma30w** - 30-week Simple Moving Average
- **sma40w** - 40-week Simple Moving Average

### Momentum Indicators
- **rsi14w** - 14-week Relative Strength Index
- **adx14w** - 14-week Average Directional Index
- **atr14w** - 14-week Average True Range

### MACD
- **macd_w** - Weekly MACD line
- **macd_signal_w** - Weekly signal line
- **macd_hist_w** - Weekly MACD histogram

### Channels
- **donch20w_high** - 20-week Donchian Channel high
- **donch20w_low** - 20-week Donchian Channel low

### Derived Metrics
- **distance_to_52w_high_w** - Weekly distance to 52-week high
- **sma_w_slope** - Weekly SMA slope (trend direction)

---

## Daily Signals (signals_daily_latest)

### Bullish Signals
1. **sma20_cross_50_up** - SMA20 crossed above SMA50 (Golden Cross mini)
2. **price_above_200** - Price above 200-day SMA (long-term uptrend)
3. **rsi_cross_50_up** - RSI crossed above 50 (momentum shift to bullish)
4. **macd_cross_up** - MACD crossed above signal line (bullish momentum)
5. **donch20_breakout** - Price hit 20-day high + ADX > 20 (breakout with trend)
6. **high_tight_zone** - Within 5% of 52-week high + volume ≥ 1.5x avg (institutional accumulation)

### Bearish Signals
1. **below_200_sma** - Price below 200-day SMA (long-term downtrend)
2. **macd_cross_down** - MACD crossed below signal line (bearish momentum)
3. **rsi_cross_50_down** - RSI crossed below 50 (momentum shift to bearish)

### Daily Trend Score (0-55 max)
```
trend_score_d =
  20 * price_above_200 +
  15 * sma20_cross_50_up +
  10 * macd_cross_up +
  10 * donch20_breakout
```

**Interpretation:**
- **45-55**: Very strong daily trend (3-4 signals)
- **30-44**: Strong daily trend (2-3 signals)
- **20-29**: Moderate daily trend (1-2 signals)
- **0-19**: Weak/no daily trend

---

## Weekly Signals (weekly_signals_latest)

### Bullish Signals
1. **stack_10_30_40** - SMA stack aligned (10w > 30w > 40w) - sustained uptrend
2. **close_above_30w** - Price above 30-week MA (weekly uptrend)
3. **donch20w_breakout** - Weekly Donchian 20 breakout
4. **macd_w_cross_up** - Weekly MACD crossed above signal (long-term bullish)
5. **rsi14w_gt_50** - Weekly RSI > 50 (weekly momentum bullish)

### Bearish Signals
1. **below_30w_ma** - Price below 30-week MA (weekly downtrend)
2. **stack_broken** - SMA stack NOT aligned (trend broken)
3. **macd_w_cross_down** - Weekly MACD crossed below signal (long-term bearish)
4. **rsi14w_lt_50** - Weekly RSI < 50 (weekly momentum bearish)

### Weekly Trend Score (0-70 max)
```
trend_score_w =
  20 * close_above_30w +
  15 * stack_10_30_40 +
  15 * macd_w_cross_up +
  10 * donch20w_breakout +
  10 * rsi14w_gt_50
```

**Interpretation:**
- **60-70**: Exceptional weekly trend (4-5 signals)
- **45-59**: Very strong weekly trend (3-4 signals)
- **30-44**: Strong weekly trend (2-3 signals)
- **20-29**: Moderate weekly trend (1-2 signals)
- **0-19**: Weak/no weekly trend

---

## Combined Score (screener_latest)

### Combined Trend Score (0-125 max)
```
combined_score = trend_score_d + trend_score_w
```

**Interpretation:**
- **100-125**: Exceptional opportunity (both daily & weekly aligned)
- **80-99**: Very strong setup
- **60-79**: Strong setup
- **40-59**: Moderate setup
- **0-39**: Weak/developing setup

### Derived Signals
- **sma_bull_stack** - Daily SMA20 > SMA50 > SMA200 (daily stack)
- **weekly_strong** - close_above_30w AND stack_10_30_40 (combined weekly strength)

---

## Trade Levels (proposed by system)

### Entry Conditions
Trade levels are proposed when:
- **donch20_breakout** = TRUE, OR
- **(sma20_cross_50_up AND price_above_200 AND macd_cross_up)** = TRUE

### Calculated Levels
- **proposed_entry** - MAX(close, donch20_high)
- **proposed_stop** - entry - (2 × ATR14)
- **target1** - entry + (2 × ATR14) (short-term target)
- **target2** - 52w_high × 1.03 (long-term target)
- **risk_reward_ratio** - (target1 - entry) / (entry - stop)

### Notes/Warnings
- "Watch-out: low trend strength (ADX<15)"
- "Watch-out: weak volume" (rel_volume < 0.8)
- "Watch-out: overbought" (RSI > 75)

---

## Filter Definitions (Screener)

### Bullish Filters
- **Above 200 SMA**: price_above_200 = TRUE
- **SMA Bull Stack**: sma20 > sma50 > sma200
- **MACD Cross ↑**: macd_cross_up = TRUE
- **Donchian Breakout**: donch20_breakout = TRUE
- **High-Tight Zone**: high_tight_zone = TRUE
- **🐂 Bull**: close_above_30w = TRUE (above 30-week MA)
- **Weekly Strong**: close_above_30w AND stack_10_30_40

### Bearish Filters
- **🐻 Bear**: below_200_sma = TRUE AND (stack_broken OR macd_w_cross_down)
- **⚠️ Weakening**: ANY bearish signal present

---

## Examples

### Perfect Setup (Score 125)
```
Daily (55):
- price_above_200 ✓ (20)
- sma20_cross_50_up ✓ (15)
- macd_cross_up ✓ (10)
- donch20_breakout ✓ (10)

Weekly (70):
- close_above_30w ✓ (20)
- stack_10_30_40 ✓ (15)
- macd_w_cross_up ✓ (15)
- donch20w_breakout ✓ (10)
- rsi14w_gt_50 ✓ (10)

Combined: 125 (maximum possible)
```

### Strong Bearish Signal
```
Bear Filter Triggered:
- below_200_sma ✓
- stack_broken ✓
- macd_w_cross_down ✓

Action: Review for exit
```

### Moderate Setup (Score 65)
```
Daily (35):
- price_above_200 ✓ (20)
- sma20_cross_50_up ✓ (15)

Weekly (30):
- close_above_30w ✓ (20)
- rsi14w_gt_50 ✓ (10)

Combined: 65 (moderate strength)
```
