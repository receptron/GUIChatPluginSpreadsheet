# /// script
# requires-python = ">=3.10"
# ///
"""Reference values for FORECAST.LINEAR, TREND, STEYX and COVARIANCE.S/.P, computed exactly.

Every input is a decimal, so the sums are exact fractions; only STEYX's square root is rounded,
at 50 digits. Writes tests/engine/fixtures/regression-reference.json, which
tests/engine/test_regression.ts compares the engine against at a relative error of 1e-9.
Regenerate with:  uv run tests/tools/generate_regression_reference.py
"""

import json
import random
from decimal import Decimal, getcontext
from fractions import Fraction
from pathlib import Path

getcontext().prec = 50
SEED = 20261019
CASES = 120
# Offsets far from zero make the naive sum-of-products formula cancel; the deviation form must not.
OFFSETS = [0, 0, 0, 1000, 1e6]


def as_fraction(text):
    return Fraction(Decimal(text))


def mean(values):
    return sum(values, Fraction(0)) / len(values)


def deviations_product(left, right):
    left_center, right_center = mean(left), mean(right)
    return sum(((a - left_center) * (b - right_center) for a, b in zip(left, right)), Fraction(0))


def as_text(value):
    return format(Decimal(value.numerator) / Decimal(value.denominator), ".20g")


def generated_case(rng):
    count = rng.randint(3, 30)
    offset = rng.choice(OFFSETS)
    xs_text = [f"{offset + rng.uniform(-50, 50):.2f}" for _ in range(count)]
    slope, noise = rng.uniform(-5, 5), rng.choice([0, 0.5, 10])
    ys_text = [f"{slope * float(x) + rng.uniform(-noise, noise) + 7:.2f}" for x in xs_text]
    return xs_text, ys_text, f"{offset + rng.uniform(-80, 80):.2f}"


def reference(xs_text, ys_text, new_x_text):
    xs, ys, new_x = [as_fraction(t) for t in xs_text], [as_fraction(t) for t in ys_text], as_fraction(new_x_text)
    count = len(xs)
    x_spread, cross = deviations_product(xs, xs), deviations_product(xs, ys)
    case = {"ys": [float(t) for t in ys_text], "xs": [float(t) for t in xs_text], "newX": float(new_x_text)}
    case["covarianceP"] = as_text(cross / count)
    case["covarianceS"] = as_text(cross / (count - 1))
    origin_squares = sum((x * x for x in xs), Fraction(0))
    case["trendThroughOrigin"] = as_text(sum((x * y for x, y in zip(xs, ys)), Fraction(0)) / origin_squares * new_x)
    if x_spread != 0:
        case["forecast"] = as_text(mean(ys) + cross / x_spread * (new_x - mean(xs)))
        residual = deviations_product(ys, ys) - cross * cross / x_spread
        case["steyx"] = format((Decimal(residual.numerator) / Decimal(residual.denominator) / (count - 2)).sqrt(), ".20g")
    return case


def main():
    rng = random.Random(SEED)
    cases = [reference(*generated_case(rng)) for _ in range(CASES)]
    out = Path(__file__).resolve().parent.parent / "engine" / "fixtures" / "regression-reference.json"
    out.write_text(json.dumps({"seed": SEED, "cases": cases}, indent=1) + "\n")
    print(f"wrote {len(cases)} cases to {out}")


main()
