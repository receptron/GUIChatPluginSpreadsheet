# /// script
# requires-python = ">=3.10"
# dependencies = ["statsmodels==0.14.4", "pandas==2.2.3", "numpy==2.1.3"]
# ///
"""Reference values for AUTOCORREL, EMA and DECOMPOSE, from statsmodels and pandas themselves:
statsmodels.tsa.stattools.acf (adjusted=False), pandas Series.ewm(alpha, adjust=False).mean(), and
statsmodels.tsa.seasonal.seasonal_decompose (two-sided, no extrapolation; NaN becomes "#N/A").

Writes tests/engine/fixtures/time-series-reference.json, which tests/engine/test_timeSeries.ts
compares the engine against at a relative error of 1e-9.
Regenerate with:  uv run tests/tools/generate_time_series_reference.py
"""

import json
import math
import random
from pathlib import Path

import numpy as np
import pandas as pd
from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.stattools import acf


def cell(value):
    return "#N/A" if math.isnan(value) else float(value)


def series(rng, length, seasonal_period=None, positive=False):
    values = []
    for t in range(length):
        level = 50 + 0.8 * t
        season = 10 * math.sin(2 * math.pi * t / seasonal_period) if seasonal_period else 0
        noise = rng.uniform(-5, 5)
        values.append(round(level + season + noise + (100 if positive else 0), 2))
    return values


def main():
    rng = random.Random(156)
    cases = []
    for _ in range(12):
        values = series(rng, rng.randint(5, 40))
        lag = rng.randint(0, len(values) - 1)
        cases.append({"fn": "AUTOCORREL", "values": values, "arg": lag, "expected": float(acf(np.array(values), nlags=lag, adjusted=False, fft=False)[lag])})
    for _ in range(8):
        values = series(rng, rng.randint(1, 30))
        alpha = round(rng.uniform(0.05, 1), 3)
        averaged = pd.Series(values).ewm(alpha=alpha, adjust=False).mean().tolist()
        cases.append({"fn": "EMA", "values": values, "arg": alpha, "expected": [float(v) for v in averaged]})
    for period in [2, 3, 4, 7, 12]:
        for model in ["additive", "multiplicative"]:
            values = series(rng, period * rng.randint(2, 4) + rng.randint(0, period - 1), seasonal_period=period, positive=True)
            result = seasonal_decompose(np.array(values), model=model, period=period)
            rows = [[cell(t), cell(s), cell(r)] for t, s, r in zip(result.trend, result.seasonal, result.resid)]
            cases.append({"fn": "DECOMPOSE", "values": values, "arg": period, "model": model, "expected": rows})
    path = Path(__file__).resolve().parents[1] / "engine" / "fixtures" / "time-series-reference.json"
    path.write_text(json.dumps(cases, indent=1) + "\n")
    print(f"wrote {len(cases)} cases to {path}")


if __name__ == "__main__":
    main()
