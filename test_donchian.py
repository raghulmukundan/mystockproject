"""
Test Donchian channel calculation to understand column order
"""
import pandas as pd
import pandas_ta as ta

# Create sample data with increasing prices
data = {
    'high': [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130, 132, 134, 136, 138, 140],
    'low': [95, 97, 99, 101, 103, 105, 107, 109, 111, 113, 115, 117, 119, 121, 123, 125, 127, 129, 131, 133, 135],
}
df = pd.DataFrame(data)

# Calculate Donchian with 20-period lookback
dc = ta.donchian(df["high"], df["low"], lower_length=20, upper_length=20)

print("Donchian output columns:", dc.columns.tolist())
print("\nLast 5 rows:")
print(df.tail())
print("\nDonchian last 5 rows:")
print(dc.tail())

print("\n\nExpected behavior:")
print("  - Upper band should be HIGHEST high over 20 periods")
print("  - Lower band should be LOWEST low over 20 periods")
print("  - With increasing prices, upper band should equal the most recent high (140)")
print(f"\nActual upper band at end: {dc.iloc[-1, 0]}")
print(f"Expected upper band: 140 (highest of last 20)")
print(f"\nActual lower band at end: {dc.iloc[-1, 1]}")
print(f"Expected lower band: 95 (lowest of all 21 values)")
