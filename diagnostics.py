"""
Comprehensive diagnostics for market data indicators
"""
import psycopg2
import pandas as pd
import numpy as np
import os
import sys
from dotenv import load_dotenv

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

load_dotenv("backend/.env")

def get_db_connection():
    """Get PostgreSQL database connection"""
    return psycopg2.connect(
        host=os.getenv('POSTGRES_HOST', 'localhost'),
        port=os.getenv('POSTGRES_PORT', '5432'),
        database=os.getenv('POSTGRES_DB', 'stockwatchlist'),
        user=os.getenv('POSTGRES_USER', 'stockuser'),
        password=os.getenv('POSTGRES_PASSWORD', 'stockpass123')
    )

def get_latest_data():
    """Get the most recent technical data with scoring"""
    conn = get_db_connection()

    # Query from technical_latest and join with symbols for liquidity info
    query = """
    SELECT
        tl.symbol,
        tl.date,
        tl.close,
        tl.volume,
        tl.sma20,
        tl.sma50,
        tl.sma200,
        tl.rsi14 as rsi,
        tl.adx14 as adx,
        tl.atr14 as atr,
        tl.donch20_high,
        tl.donch20_low,
        tl.macd,
        tl.macd_signal,
        tl.macd_hist,
        tl.avg_vol20,
        tl.high_252 as high_52w,
        tl.distance_to_52w_high,
        tl.rel_volume as relative_volume,
        (tl.atr14 / NULLIF(tl.close, 0) * 100) as atr_pct,
        (tl.close * tl.avg_vol20) as avg_dollar_vol,
        -- Calculate derived flags
        CASE WHEN tl.close >= tl.donch20_high * 0.98 THEN true ELSE false END as near_breakout,
        CASE WHEN tl.macd > tl.macd_signal AND LAG(tl.macd) OVER (PARTITION BY tl.symbol ORDER BY tl.date) <= LAG(tl.macd_signal) OVER (PARTITION BY tl.symbol ORDER BY tl.date) THEN true ELSE false END as macd_cross_up
    FROM technical_latest tl
    WHERE tl.close IS NOT NULL
        AND tl.sma20 IS NOT NULL
        AND tl.sma50 IS NOT NULL
        AND tl.sma200 IS NOT NULL
    ORDER BY (tl.close * tl.avg_vol20) DESC NULLS LAST
    """

    df = pd.read_sql_query(query, conn)

    # Calculate macd_hist_trending_up (3-day positive trend)
    df['macd_hist_trending_up'] = False  # Simplified for now

    # Calculate scoring (simplified version based on your scoring system)
    df['trend_score_d'] = 0.0
    df['trend_score_w'] = 0.0
    df['combined_score'] = 0.0

    # Daily scoring components
    df.loc[df['sma20'] > df['sma50'], 'trend_score_d'] += 10
    df.loc[df['sma50'] > df['sma200'], 'trend_score_d'] += 10
    df.loc[df['close'] > df['sma20'], 'trend_score_d'] += 5
    df.loc[df['macd_hist'] > 0, 'trend_score_d'] += 10
    df.loc[df['rsi'].between(50, 70), 'trend_score_d'] += 10
    df.loc[df['adx'] > 20, 'trend_score_d'] += 10

    # Weekly scoring (simplified)
    df['trend_score_w'] = df['trend_score_d'] * 1.27  # Scale to 70 max

    # Combined
    df['combined_score'] = df['trend_score_d'] + df['trend_score_w']

    conn.close()
    return df

def check_liquidity(df):
    """Liquidity diagnostics"""
    print("\n" + "="*80)
    print("1. LIQUIDITY METRICS (avg_dollar_vol)")
    print("="*80)

    # Check large caps
    large_caps = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META']
    print("\nLarge Cap Liquidity Check:")
    for symbol in large_caps:
        row = df[df['symbol'] == symbol]
        if not row.empty:
            vol = row['avg_dollar_vol'].iloc[0] / 1_000_000
            status = "✓" if vol > 50 else "✗"
            print(f"  {status} {symbol:6s}: ${vol:>10.1f}M")
        else:
            print(f"  ✗ {symbol:6s}: NOT FOUND")

    # Overall distribution
    print(f"\nOverall Distribution:")
    print(f"  Total symbols: {len(df)}")
    print(f"  > $1M:  {(df['avg_dollar_vol'] > 1_000_000).sum():>6} ({(df['avg_dollar_vol'] > 1_000_000).sum()/len(df)*100:>5.1f}%)")
    print(f"  > $10M: {(df['avg_dollar_vol'] > 10_000_000).sum():>6} ({(df['avg_dollar_vol'] > 10_000_000).sum()/len(df)*100:>5.1f}%)")
    print(f"  > $50M: {(df['avg_dollar_vol'] > 50_000_000).sum():>6} ({(df['avg_dollar_vol'] > 50_000_000).sum()/len(df)*100:>5.1f}%)")

    print(f"\nQuartiles (millions):")
    quartiles = df['avg_dollar_vol'].quantile([0.25, 0.5, 0.75]) / 1_000_000
    print(f"  25th: ${quartiles.iloc[0]:>8.1f}M")
    print(f"  50th: ${quartiles.iloc[1]:>8.1f}M")
    print(f"  75th: ${quartiles.iloc[2]:>8.1f}M")

def check_volatility(df):
    """Volatility diagnostics"""
    print("\n" + "="*80)
    print("2. VOLATILITY METRICS (atr_pct)")
    print("="*80)

    atr = df['atr_pct'].dropna()

    print(f"\nDistribution:")
    print(f"  Count: {len(atr)}")
    print(f"  Mean:  {atr.mean():.2f}%")
    print(f"  Median: {atr.median():.2f}%")
    print(f"  Std:   {atr.std():.2f}%")

    print(f"\nRange Breakdown:")
    print(f"  1-6%:   {((atr >= 1) & (atr <= 6)).sum():>6} ({((atr >= 1) & (atr <= 6)).sum()/len(atr)*100:>5.1f}%)")
    print(f"  6-10%:  {((atr > 6) & (atr <= 10)).sum():>6} ({((atr > 6) & (atr <= 10)).sum()/len(atr)*100:>5.1f}%)")
    print(f"  >10%:   {(atr > 10).sum():>6} ({(atr > 10).sum()/len(atr)*100:>5.1f}%) ← outliers")

    print(f"\nOutliers (>10% ATR) - Sample:")
    outliers = df[df['atr_pct'] > 10].nlargest(5, 'atr_pct')[['symbol', 'atr_pct', 'avg_dollar_vol']]
    for _, row in outliers.iterrows():
        print(f"  {row['symbol']:6s}: {row['atr_pct']:5.2f}% (vol: ${row['avg_dollar_vol']/1e6:.1f}M)")

def check_rsi(df):
    """RSI diagnostics"""
    print("\n" + "="*80)
    print("3. RSI METRICS")
    print("="*80)

    rsi = df['rsi'].dropna()

    print(f"\nRange Check:")
    print(f"  Min: {rsi.min():.2f}")
    print(f"  Max: {rsi.max():.2f}")
    out_of_range = ((rsi < 0) | (rsi > 100)).sum()
    status = "✓" if out_of_range == 0 else f"✗ {out_of_range} out of range"
    print(f"  Status: {status}")

    print(f"\nDistribution:")
    print(f"  Mean:   {rsi.mean():.2f}")
    print(f"  Median: {rsi.median():.2f}")
    print(f"  Std:    {rsi.std():.2f}")

    print(f"\nZone Breakdown:")
    print(f"  Oversold (<30):   {(rsi < 30).sum():>6} ({(rsi < 30).sum()/len(rsi)*100:>5.1f}%)")
    print(f"  Neutral (30-70):  {((rsi >= 30) & (rsi <= 70)).sum():>6} ({((rsi >= 30) & (rsi <= 70)).sum()/len(rsi)*100:>5.1f}%)")
    print(f"  Overbought (>70): {(rsi > 70).sum():>6} ({(rsi > 70).sum()/len(rsi)*100:>5.1f}%)")

    print(f"\nQuartiles:")
    for q, val in zip([25, 50, 75], rsi.quantile([0.25, 0.5, 0.75])):
        print(f"  {q}th: {val:.2f}")

def check_moving_averages(df):
    """Moving average relationships"""
    print("\n" + "="*80)
    print("4. MOVING AVERAGE RELATIONSHIPS")
    print("="*80)

    # Filter for valid data
    valid = df[df['sma20'].notna() & df['sma50'].notna() & df['sma200'].notna()].copy()

    print(f"\nBull Stack Check (sma20 > sma50 > sma200):")
    bull_stack = (valid['sma20'] > valid['sma50']) & (valid['sma50'] > valid['sma200'])
    print(f"  Perfect bull stack: {bull_stack.sum():>6} ({bull_stack.sum()/len(valid)*100:>5.1f}%)")

    print(f"\nPartial Bull Stack (sma20 > sma50):")
    partial = valid['sma20'] > valid['sma50']
    print(f"  Above 50-day: {partial.sum():>6} ({partial.sum()/len(valid)*100:>5.1f}%)")

    print(f"\nAbove Long-term (sma50 > sma200):")
    above_200 = valid['sma50'] > valid['sma200']
    print(f"  Count: {above_200.sum():>6} ({above_200.sum()/len(valid)*100:>5.1f}%)")

    # Velocity check (SMAs should change at different rates)
    print(f"\nSMA Spread Analysis (sample):")
    sample = valid.nlargest(5, 'avg_dollar_vol')[['symbol', 'close', 'sma20', 'sma50', 'sma200']]
    for _, row in sample.iterrows():
        s20_pct = (row['close'] - row['sma20']) / row['sma20'] * 100
        s50_pct = (row['close'] - row['sma50']) / row['sma50'] * 100
        s200_pct = (row['close'] - row['sma200']) / row['sma200'] * 100
        print(f"  {row['symbol']:6s}: Close=${row['close']:>7.2f}  "
              f"vs 20d:{s20_pct:>+6.2f}%  vs 50d:{s50_pct:>+6.2f}%  vs 200d:{s200_pct:>+6.2f}%")

def check_macd(df):
    """MACD diagnostics"""
    print("\n" + "="*80)
    print("5. MACD CALCULATIONS")
    print("="*80)

    valid = df[df['macd'].notna() & df['macd_signal'].notna() & df['macd_hist'].notna()].copy()

    # Histogram calculation check
    valid['hist_calc'] = valid['macd'] - valid['macd_signal']
    valid['hist_diff'] = abs(valid['hist_calc'] - valid['macd_hist'])

    print(f"\nHistogram Calculation Check (macd - signal = hist):")
    calc_errors = (valid['hist_diff'] > 0.01).sum()
    status = "✓" if calc_errors == 0 else f"✗ {calc_errors} errors"
    print(f"  Status: {status}")
    if calc_errors > 0:
        print(f"  Max error: {valid['hist_diff'].max():.4f}")

    print(f"\nHistogram Distribution:")
    hist = valid['macd_hist']
    print(f"  Positive (bullish): {(hist > 0).sum():>6} ({(hist > 0).sum()/len(hist)*100:>5.1f}%)")
    print(f"  Negative (bearish): {(hist < 0).sum():>6} ({(hist < 0).sum()/len(hist)*100:>5.1f}%)")
    print(f"  Neutral (near 0):   {(abs(hist) < 0.1).sum():>6} ({(abs(hist) < 0.1).sum()/len(hist)*100:>5.1f}%)")

    print(f"\nMACD Cross-ups (macd_cross_up = true):")
    crossups = df['macd_cross_up'].sum()
    print(f"  Count: {crossups} ({crossups/len(df)*100:.2f}%)")

    if crossups > 0:
        print(f"\n  Sample Cross-ups:")
        samples = df[df['macd_cross_up']][['symbol', 'macd', 'macd_signal', 'macd_hist']].head(5)
        for _, row in samples.iterrows():
            print(f"    {row['symbol']:6s}: MACD={row['macd']:>7.3f}  Signal={row['macd_signal']:>7.3f}  Hist={row['macd_hist']:>7.3f}")

def check_adx(df):
    """ADX diagnostics"""
    print("\n" + "="*80)
    print("6. ADX TREND STRENGTH")
    print("="*80)

    adx = df['adx'].dropna()

    print(f"\nDistribution:")
    print(f"  Mean:   {adx.mean():.2f}")
    print(f"  Median: {adx.median():.2f}")

    print(f"\nRange Breakdown:")
    print(f"  Weak (<15):      {(adx < 15).sum():>6} ({(adx < 15).sum()/len(adx)*100:>5.1f}%) ← choppy")
    print(f"  Moderate (15-25): {((adx >= 15) & (adx < 25)).sum():>6} ({((adx >= 15) & (adx < 25)).sum()/len(adx)*100:>5.1f}%)")
    print(f"  Strong (25-40):   {((adx >= 25) & (adx < 40)).sum():>6} ({((adx >= 25) & (adx < 40)).sum()/len(adx)*100:>5.1f}%) ← trending")
    print(f"  Very Strong (>40): {(adx >= 40).sum():>6} ({(adx >= 40).sum()/len(adx)*100:>5.1f}%)")

    print(f"\nTop Trending Stocks (highest ADX):")
    top_adx = df.nlargest(5, 'adx')[['symbol', 'adx', 'rsi', 'avg_dollar_vol']]
    for _, row in top_adx.iterrows():
        print(f"  {row['symbol']:6s}: ADX={row['adx']:>5.2f}  RSI={row['rsi']:>5.1f}  Vol=${row['avg_dollar_vol']/1e6:.1f}M")

def check_donchian_breakout(df):
    """Donchian and near_breakout diagnostics"""
    print("\n" + "="*80)
    print("7. DONCHIAN & NEAR BREAKOUT")
    print("="*80)

    valid = df[df['donch20_high'].notna()].copy()

    print(f"\nNear Breakout Count:")
    near_bo = df['near_breakout'].sum()
    print(f"  Total: {near_bo} ({near_bo/len(df)*100:.2f}%)")

    if near_bo > 0:
        print(f"\n  Symbols Near Breakout (top 10 by liquidity):")
        near_breakout_df = df[df['near_breakout']].nlargest(10, 'avg_dollar_vol')
        for _, row in near_breakout_df[['symbol', 'close', 'donch20_high', 'distance_to_52w_high', 'avg_dollar_vol']].iterrows():
            pct_to_donch = (row['close'] - row['donch20_high']) / row['donch20_high'] * 100
            print(f"    {row['symbol']:6s}: Close=${row['close']:>7.2f}  "
                  f"Donch=${row['donch20_high']:>7.2f} ({pct_to_donch:>+5.2f}%)  "
                  f"52w:{row['distance_to_52w_high']:>+6.2f}%")

    # Check Donchian high behavior (should be flat or rising)
    print(f"\nDonchian High Sanity:")
    print(f"  Sample symbols (checking if donch20_high >= close over lookback):")
    sample = valid.nlargest(5, 'avg_dollar_vol')[['symbol', 'close', 'donch20_high']]
    for _, row in sample.iterrows():
        status = "✓" if row['donch20_high'] >= row['close'] else "✗"
        print(f"    {status} {row['symbol']:6s}: Close=${row['close']:>7.2f}  Donch20High=${row['donch20_high']:>7.2f}")

def check_52w_high(df):
    """52-week high distance diagnostics"""
    print("\n" + "="*80)
    print("8. 52-WEEK HIGH DISTANCE")
    print("="*80)

    dist = df['distance_to_52w_high'].dropna()

    print(f"\nDistribution:")
    print(f"  Mean:   {dist.mean():.2f}%")
    print(f"  Median: {dist.median():.2f}%")

    print(f"\nRange Breakdown:")
    print(f"  At/near 52w high (0 to -5%):   {((dist >= -5) & (dist <= 0)).sum():>6} ({((dist >= -5) & (dist <= 0)).sum()/len(dist)*100:>5.1f}%) ← leaders")
    print(f"  Moderate pull (-5% to -15%):   {((dist >= -15) & (dist < -5)).sum():>6} ({((dist >= -15) & (dist < -5)).sum()/len(dist)*100:>5.1f}%)")
    print(f"  Deep pull (-15% to -30%):      {((dist >= -30) & (dist < -15)).sum():>6} ({((dist >= -30) & (dist < -15)).sum()/len(dist)*100:>5.1f}%)")
    print(f"  Far from highs (< -30%):       {(dist < -30).sum():>6} ({(dist < -30).sum()/len(dist)*100:>5.1f}%)")

    print(f"\nLeaders (closest to 52w high):")
    leaders = df.nsmallest(10, 'distance_to_52w_high')[['symbol', 'close', 'high_52w', 'distance_to_52w_high', 'rsi']]
    for _, row in leaders.iterrows():
        print(f"  {row['symbol']:6s}: ${row['close']:>7.2f} vs 52w high ${row['high_52w']:>7.2f}  "
              f"({row['distance_to_52w_high']:>+6.2f}%)  RSI={row['rsi']:>5.1f}")

def check_scoring(df):
    """Score range and weight diagnostics"""
    print("\n" + "="*80)
    print("9. SCORING SYSTEM")
    print("="*80)

    print(f"\nScore Ranges:")

    # Daily score
    ds = df['trend_score_d'].dropna()
    print(f"\n  Daily Trend Score:")
    print(f"    Min: {ds.min():.0f}  Max: {ds.max():.0f}  (expected: 0-55)")
    out_of_range = ((ds < 0) | (ds > 55)).sum()
    status = "✓" if out_of_range == 0 else f"✗ {out_of_range} out of range"
    print(f"    Status: {status}")
    print(f"    Mean: {ds.mean():.2f}  Median: {ds.median():.2f}")

    # Weekly score
    ws = df['trend_score_w'].dropna()
    print(f"\n  Weekly Trend Score:")
    print(f"    Min: {ws.min():.0f}  Max: {ws.max():.0f}  (expected: 0-70)")
    out_of_range = ((ws < 0) | (ws > 70)).sum()
    status = "✓" if out_of_range == 0 else f"✗ {out_of_range} out of range"
    print(f"    Status: {status}")
    print(f"    Mean: {ws.mean():.2f}  Median: {ws.median():.2f}")

    # Combined score
    cs = df['combined_score'].dropna()
    print(f"\n  Combined Score:")
    print(f"    Min: {cs.min():.0f}  Max: {cs.max():.0f}  (expected: 0-125)")
    out_of_range = ((cs < 0) | (cs > 125)).sum()
    status = "✓" if out_of_range == 0 else f"✗ {out_of_range} out of range"
    print(f"    Status: {status}")
    print(f"    Mean: {cs.mean():.2f}  Median: {cs.median():.2f}")

    print(f"\n  Top Scorers:")
    top = df.nlargest(10, 'combined_score')[['symbol', 'trend_score_d', 'trend_score_w', 'combined_score', 'rsi']]
    for _, row in top.iterrows():
        print(f"    {row['symbol']:6s}: Daily={row['trend_score_d']:>5.1f}  "
              f"Weekly={row['trend_score_w']:>5.1f}  Combined={row['combined_score']:>6.1f}  RSI={row['rsi']:>5.1f}")

def spot_check_five_tickers(df):
    """Detailed spot check of 5 key tickers"""
    print("\n" + "="*80)
    print("10. 5-TICKER SPOT CHECK")
    print("="*80)

    tickers = ['AAPL', 'MSFT', 'NVDA', 'SPY', 'IWM']

    for symbol in tickers:
        row = df[df['symbol'] == symbol]
        if row.empty:
            print(f"\n{symbol}: NOT FOUND")
            continue

        row = row.iloc[0]
        print(f"\n{symbol}:")
        print(f"  Close: ${row['close']:.2f}")
        print(f"  Liquidity: ${row['avg_dollar_vol']/1e6:.1f}M")
        print(f"  RSI: {row['rsi']:.1f} ({'oversold' if row['rsi'] < 30 else 'overbought' if row['rsi'] > 70 else 'neutral'})")
        print(f"  ATR: {row['atr_pct']:.2f}%")

        # MA stack
        if row['sma20'] > row['sma50'] > row['sma200']:
            ma_status = "✓ Bull stack (20>50>200)"
        elif row['sma20'] > row['sma50']:
            ma_status = "Partial bull (20>50)"
        else:
            ma_status = "Bearish/mixed"
        print(f"  Moving Averages: {ma_status}")
        print(f"    20d: ${row['sma20']:.2f}  50d: ${row['sma50']:.2f}  200d: ${row['sma200']:.2f}")

        # MACD
        macd_status = "bullish" if row['macd_hist'] > 0 else "bearish"
        print(f"  MACD: {macd_status} (hist={row['macd_hist']:.3f})")
        if row['macd_cross_up']:
            print(f"    ⚡ MACD cross-up signal!")

        # ADX
        adx_status = "strong trend" if row['adx'] > 25 else "weak/choppy" if row['adx'] < 15 else "moderate"
        print(f"  ADX: {row['adx']:.1f} ({adx_status})")

        # 52w high
        print(f"  Distance to 52w high: {row['distance_to_52w_high']:.2f}%")

        # Near breakout
        if row['near_breakout']:
            print(f"  🔥 NEAR BREAKOUT (within 2% of 20d high)")

        # Scores
        print(f"  Scores: Daily={row['trend_score_d']:.0f}  Weekly={row['trend_score_w']:.0f}  Combined={row['combined_score']:.0f}")

def acceptance_summary(df):
    """Overall pass/fail summary"""
    print("\n" + "="*80)
    print("ACCEPTANCE SUMMARY")
    print("="*80)

    checks = []

    # Check 1: Near breakout symbols exist
    near_bo = df['near_breakout'].sum()
    checks.append(("Near breakout signals exist", near_bo > 0, f"{near_bo} symbols"))

    # Check 2: MACD histogram trending up exists
    macd_trend = df['macd_hist_trending_up'].sum() if 'macd_hist_trending_up' in df.columns else 0
    checks.append(("MACD hist trending up exists", macd_trend > 0, f"{macd_trend} symbols"))

    # Check 3: RSI in valid range
    rsi = df['rsi'].dropna()
    rsi_valid = ((rsi >= 0) & (rsi <= 100)).all()
    checks.append(("RSI in valid range (0-100)", rsi_valid, f"All {len(rsi)} values"))

    # Check 4: ADX distribution reasonable
    adx = df['adx'].dropna()
    adx_reasonable = (adx.mean() >= 10) and (adx.mean() <= 35)
    checks.append(("ADX distribution reasonable", adx_reasonable, f"Mean={adx.mean():.1f}"))

    # Check 5: ATR distribution reasonable
    atr = df['atr_pct'].dropna()
    atr_reasonable = (atr.mean() >= 1) and (atr.mean() <= 10)
    checks.append(("ATR distribution reasonable", atr_reasonable, f"Mean={atr.mean():.2f}%"))

    # Check 6: Scores in valid ranges
    score_valid = True
    if 'trend_score_d' in df.columns:
        ds = df['trend_score_d'].dropna()
        score_valid &= ((ds >= 0) & (ds <= 55)).all()
    if 'trend_score_w' in df.columns:
        ws = df['trend_score_w'].dropna()
        score_valid &= ((ws >= 0) & (ws <= 70)).all()
    if 'combined_score' in df.columns:
        cs = df['combined_score'].dropna()
        score_valid &= ((cs >= 0) & (cs <= 125)).all()
    checks.append(("Scores in valid ranges", score_valid, "All within bounds"))

    # Check 7: MA relationships make sense
    valid = df[df['sma20'].notna() & df['sma50'].notna() & df['sma200'].notna()]
    bull_stack = ((valid['sma20'] > valid['sma50']) & (valid['sma50'] > valid['sma200'])).sum()
    ma_reasonable = bull_stack > 0
    checks.append(("Bull stack patterns exist", ma_reasonable, f"{bull_stack} symbols"))

    print("\nChecks:")
    all_passed = True
    for check_name, passed, detail in checks:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {check_name} ({detail})")
        all_passed &= passed

    print(f"\n{'='*80}")
    if all_passed:
        print("🎉 ALL CHECKS PASSED - Data quality looks good!")
    else:
        print("⚠️  SOME CHECKS FAILED - Review diagnostics above")
    print(f"{'='*80}")

def main():
    print("MARKET DATA DIAGNOSTICS")
    print("=" * 80)

    df = get_latest_data()
    print(f"\nLoaded {len(df)} symbols from most recent date")
    if len(df) > 0:
        print(f"Date: {df['date'].iloc[0]}")

    check_liquidity(df)
    check_volatility(df)
    check_rsi(df)
    check_moving_averages(df)
    check_macd(df)
    check_adx(df)
    check_donchian_breakout(df)
    check_52w_high(df)
    check_scoring(df)
    spot_check_five_tickers(df)
    acceptance_summary(df)

    print("\n" + "="*80)
    print("DIAGNOSTICS COMPLETE")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()
