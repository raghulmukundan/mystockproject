import pandas as pd
import numpy as np

try:
    import pandas_ta as ta  # type: ignore
except Exception:
    ta = None


def compute_indicators_tail(df: pd.DataFrame) -> pd.DataFrame:
    if ta is None:
        raise RuntimeError(
            "pandas-ta is required. Install with: pip install \"pandas-ta==0.3.14b0\" (Py3.8-3.11) or pip install --pre \"pandas-ta>=0.4.67b0\" (Py3.12+)."
        )

    out = df.copy()

    out["sma20"]  = ta.sma(out["close"], length=20)
    out["sma50"]  = ta.sma(out["close"], length=50)
    out["sma200"] = ta.sma(out["close"], length=200)

    out["atr14"]  = ta.atr(out["high"], out["low"], out["close"], length=14)
    out["rsi14"]  = ta.rsi(out["close"], length=14)
    adx = ta.adx(out["high"], out["low"], out["close"], length=14)
    out["adx14"]  = adx.get("ADX_14", adx.iloc[:, 0])

    dc = ta.donchian(out["high"], out["low"], lower_length=20, upper_length=20)
    out["donch20_high"] = dc.iloc[:, 0]
    out["donch20_low"]  = dc.iloc[:, 1]

    macd = ta.macd(out["close"])  # 12,26,9
    out["macd"]        = macd.get("MACD_12_26_9", macd.iloc[:, 0])
    out["macd_signal"] = macd.get("MACDs_12_26_9", macd.iloc[:, 1])
    out["macd_hist"]   = macd.get("MACDh_12_26_9", macd.iloc[:, 2])

    out["avg_vol20"] = out["volume"].rolling(20, min_periods=20).mean()
    out["high_252"]  = out["close"].rolling(252, min_periods=252).max()

    out["distance_to_52w_high"] = np.where(out["high_252"] > 0, (out["high_252"] - out["close"]) / out["high_252"], np.nan)
    out["rel_volume"] = np.where(out["avg_vol20"] > 0, out["volume"] / out["avg_vol20"], np.nan)
    out["sma_slope"]  = out["sma20"] - out["sma50"]

    return out
