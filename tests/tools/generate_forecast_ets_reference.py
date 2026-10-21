# /// script
# requires-python = ">=3.10"
# dependencies = ["statsmodels==0.14.4", "numpy==2.1.3"]
# ///
"""Reference values for FORECAST.ETS's model, from statsmodels' ExponentialSmoothing (additive trend,
additive season or none) started from the engine's initial state (initialization_method="known"):

- with smoothing parameters given, the forecasts 1, 2, … steps ahead and the mean squared one-step
  error, which tests/engine/test_forecastEts.ts compares the engine against at a relative error of 1e-9.
  The forecasts are built from statsmodels' final level, trend and seasons as level + h·trend + the
  latest season of that phase (Hyndman et al.): statsmodels' own forecast() replaces the season the
  last value updated with the one before it;
- with statsmodels choosing them, the mean squared one-step error it reaches, which the engine's own
  choice must come within 1% of.

The initial state is the engine's rule: with a season, the first season's mean, the change between
the first two seasons' means over the period, and the first season's deviations; without one, the
second value and the first difference, the model smoothing from the third value.

Writes tests/engine/fixtures/forecast-ets-reference.json.
Regenerate with:  uv run tests/tools/generate_forecast_ets_reference.py
"""

import json
import math
import random
from pathlib import Path

import numpy as np
from statsmodels.tsa.holtwinters import ExponentialSmoothing


def series(rng, length, period):
    slope = rng.uniform(-1, 2)
    amplitude = rng.uniform(0, 15)
    values = []
    for t in range(length):
        season = amplitude * math.sin(2 * math.pi * t / period) if period else 0
        values.append(round(50 + slope * t + season + rng.uniform(-4, 4), 2))
    return values


def model(values, period):
    ys = np.array(values)
    if period == 0:
        return ExponentialSmoothing(ys[2:], trend="add", initialization_method="known", initial_level=ys[1], initial_trend=ys[1] - ys[0]), len(ys) - 2
    first = ys[:period].mean()
    trend = (ys[period : 2 * period].mean() - first) / period
    known = dict(initialization_method="known", initial_level=first, initial_trend=trend, initial_seasonal=ys[:period] - first)
    return ExponentialSmoothing(ys, trend="add", seasonal="add", seasonal_periods=period, **known), len(ys)


def forecasts(result, period, steps):
    level, trend = result.level[-1], result.trend[-1]
    seasons = result.season[-period:] if period else [0]
    return [float(level + h * trend + seasons[(h - 1) % len(seasons)]) for h in range(1, steps + 1)]


def case(rng, period):
    length = (2 * period if period else 3) + rng.randint(0, 3 * max(period, 4))
    values = series(rng, length, period)
    alpha = round(rng.uniform(0, 1), 3)
    smoothing = {"alpha": alpha, "beta": round(rng.uniform(0, 1), 3), "gamma": round(rng.uniform(0, 1 - alpha), 3) if period else 0}
    built, count = model(values, period)
    fixed = built.fit(smoothing_level=smoothing["alpha"], smoothing_trend=smoothing["beta"], smoothing_seasonal=smoothing["gamma"] if period else None, optimized=False)
    optimum = model(values, period)[0].fit()
    steps = 2 * max(period, 3)
    return {
        "values": values,
        "period": period,
        "smoothing": smoothing,
        "forecasts": forecasts(fixed, period, steps),
        "variance": float(fixed.sse / count),
        "optimumVariance": float(optimum.sse / count),
    }


def main():
    rng = random.Random(149)
    cases = [case(rng, period) for period in [0, 0, 0, 0, 2, 3, 4, 4, 7, 12, 12]]
    path = Path(__file__).resolve().parents[1] / "engine" / "fixtures" / "forecast-ets-reference.json"
    path.write_text(json.dumps(cases, indent=1) + "\n")
    print(f"wrote {len(cases)} cases to {path}")


if __name__ == "__main__":
    main()
