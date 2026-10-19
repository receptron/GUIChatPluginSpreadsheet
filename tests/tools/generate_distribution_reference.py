# /// script
# requires-python = ">=3.10"
# dependencies = ["mpmath==1.3.0"]
# ///
"""Reference values for the t and normal distributions, computed at 50 significant digits.

Writes tests/engine/fixtures/distribution-reference.json, which
tests/engine/test_distributions.ts compares the engine against at a relative error of 1e-9.
Regenerate with:  uv run tests/tools/generate_distribution_reference.py
"""

import json
from pathlib import Path

from mpmath import mp, mpf, beta, log, loggamma, ncdf, npdf, sqrt

mp.dps = 50

DFS = [1, 2, 3, 4, 5, 7, 10, 15, 30, 60, 100, 1000, 100000]
LARGE_DFS = [10**7, 10**9]  # Excel takes up to 1e10; ln B(df/2, 1/2) cancels here unless it is split
LARGE_DF_TS = [0, 0.5, 1, 1.7, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 8]
GAMMA_ARGS = [0.001, 0.1, 0.5, 1, 1.5, 2, 3.7, 9.999, 10, 10.001, 12.5, 30, 100, 1000, 1e5, 1e8]
BETA_ARGS = [(0.5, 0.5), (0.5, 3), (2.5, 0.5), (5, 9), (9.5, 0.5), (10, 0.5), (12, 3), (50, 0.5), (500, 0.5), (5e4, 0.5), (5e6, 0.5), (5e8, 0.5)]
UPPER_PS = ["0.6", "0.9", "0.975", "0.999", "0.999999"]  # the mirrored half of the normal quantile
TS = [0, 0.001, 0.1, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 10, 20, 50, 100, 1000]
ZS = [0, 0.001, 0.25, 0.5, 1, 1.333333, 1.96, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 30, 37]
PS = ["1e-300", "1e-100", "1e-20", "1e-10", "1e-6", "0.0001", "0.001", "0.01", "0.025", "0.05", "0.1", "0.2", "0.3", "0.4", "0.45", "0.49", "0.5"]


def beta_series(x, a, b):
    """I_x(a, b) by the 2F1(a+b, 1; a+1; x) series; converges quickly for x <= 1/2."""
    term, total, n = mpf(1), mpf(1), 0
    while abs(term) > mpf(10) ** -(mp.dps + 10) * abs(total):
        term *= (a + b + n) / (a + 1 + n) * x
        total += term
        n += 1
    return x**a * (1 - x) ** b / (a * beta(a, b)) * total


def regularized_beta(x, a, b):
    """I_x(a, b) to 50 good digits. Above x = 1/2 it is 1 - I_(1-x)(b, a), and that difference
    cancels when the answer is small, so the precision doubles until 50 digits survive it."""
    if x <= mpf(1) / 2:
        return beta_series(x, a, b)
    digits = mp.dps
    while True:
        with mp.workdps(digits):
            difference = 1 - beta_series(1 - mpf(x), mpf(b), mpf(a))
            if difference != 0 and difference > mpf(10) ** (60 - digits):
                return +difference
        digits *= 2


def t_upper(t, df):
    t, df = mpf(t), mpf(df)
    half = regularized_beta(df / (df + t * t), df / 2, mpf(1) / 2) / 2
    return half if t >= 0 else 1 - half


SMALLEST_KEPT = mpf("1e-300")  # below this a double cannot hold the answer at full precision


def keep(case, skipped, label):
    """Append the case unless the reference could not be computed or underflows a double."""
    try:
        values = case()
    except Exception as error:  # noqa: BLE001 - recorded, not hidden
        skipped.append(f"{label}: {type(error).__name__}")
        return None
    return values


def t_density(t, df):
    t, df = mpf(t), mpf(df)
    return (1 + t * t / df) ** (-(df + 1) / 2) / (sqrt(df) * beta(df / 2, mpf(1) / 2))


def t_upper_quantile(q, df):
    q, df = mpf(q), mpf(df)
    low, high = mpf(0), mpf(1)
    while t_upper(high, df) > q:
        high *= 2
    for _ in range(400):  # bisection to far below double precision
        middle = (low + high) / 2
        if t_upper(middle, df) > q:
            low = middle
        else:
            high = middle
    return (low + high) / 2


def normal_quantile(p):
    """The z with P(Z <= z) = p, by bisection on ncdf: 2p - 1 rounds to -1 for a tiny p."""
    p = mpf(p)
    low, high = mpf(-40), mpf(40)
    for _ in range(400):
        middle = (low + high) / 2
        if ncdf(middle) < p:
            low = middle
        else:
            high = middle
    return (low + high) / 2


SAMPLES = [
    ([3, 4, 5, 8, 9, 1, 2, 4, 5], [6, 19, 3, 2, 14, 4, 5, 17, 1]),  # Microsoft's T.TEST example
    ([10.1, 9.8, 10.4, 10.0, 9.9, 10.3], [11.2, 10.7, 11.6, 11.1, 10.8, 11.5]),
    ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 2, 3, 3, 4, 4, 5, 5, 6, 30]),
    ([0.5, 0.7, 0.2, 0.9], [0.4, 0.8, 0.1, 0.6]),
    ([100, 102, 98, 101, 99, 103, 97, 100], [90, 130, 70, 110, 95, 125, 80, 105]),
]


def summary(values):
    values = [mpf(v) for v in values]
    count = len(values)
    mean = sum(values) / count
    return count, mean, sum((v - mean) ** 2 for v in values) / (count - 1)


def t_test(first, second, test_type):
    """Excel's T.TEST statistic and degrees of freedom: 1 paired, 2 pooled, 3 Welch."""
    if test_type == 1:
        n, mean, variance = summary([a - b for a, b in zip(first, second)])
        return mean / sqrt(variance / n), mpf(n - 1)
    n1, m1, v1 = summary(first)
    n2, m2, v2 = summary(second)
    if test_type == 2:
        df = mpf(n1 + n2 - 2)
        pooled = ((n1 - 1) * v1 + (n2 - 1) * v2) / df
        return (m1 - m2) / sqrt(pooled * (mpf(1) / n1 + mpf(1) / n2)), df
    s1, s2 = v1 / n1, v2 / n2
    return (m1 - m2) / sqrt(s1 + s2), (s1 + s2) ** 2 / (s1**2 / (n1 - 1) + s2**2 / (n2 - 1))


def num(value):
    return float(value)


def main():
    out = {"t": [], "tQuantile": [], "normal": [], "normalQuantile": [], "tTest": [], "logGamma": [], "logBeta": []}
    for x in GAMMA_ARGS:
        out["logGamma"].append({"x": x, "value": num(loggamma(mpf(x)))})
    for a, b in BETA_ARGS:
        out["logBeta"].append({"a": a, "b": b, "value": num(log(beta(mpf(a), mpf(b))))})
    for df in LARGE_DFS:
        for t in LARGE_DF_TS:
            for sign in (1, -1):
                if t == 0 and sign == -1:
                    continue
                value = sign * t
                out["t"].append({"t": value, "df": df, "upper": num(t_upper(value, df)), "density": num(t_density(value, df))})
    skipped = []
    for df in DFS:
        for t in TS:
            for sign in (1, -1):
                if t == 0 and sign == -1:
                    continue
                value = sign * t
                upper = keep(lambda: t_upper(value, df), skipped, f"t upper t={value} df={df}")
                if upper is None or upper < SMALLEST_KEPT:
                    if upper is not None:
                        skipped.append(f"t upper t={value} df={df}: below 1e-300")
                    continue
                out["t"].append({"t": value, "df": df, "upper": num(upper), "density": num(t_density(value, df))})
        for p in PS:
            if mpf(p) < mpf("1e-20") and df > 1000:
                continue
            quantile = keep(lambda: t_upper_quantile(mpf(p), df), skipped, f"t quantile q={p} df={df}")
            if quantile is not None:
                out["tQuantile"].append({"q": float(mpf(p)), "df": df, "t": num(quantile)})
    for z in ZS:
        for sign in (1, -1):
            if z == 0 and sign == -1:
                continue
            value = mpf(sign * z)
            out["normal"].append({"z": float(value), "upper": num(1 - ncdf(value)) if value <= 0 else num(ncdf(-value)), "density": num(npdf(value))})
    for p in PS + UPPER_PS:
        out["normalQuantile"].append({"p": float(mpf(p)), "z": num(normal_quantile(p))})
    for first, second in SAMPLES:
        for test_type in (1, 2, 3):
            t, df = t_test(first, second, test_type)
            for tails in (1, 2):
                out["tTest"].append({"first": first, "second": second, "type": test_type, "tails": tails, "p": num(tails * t_upper(abs(t), df))})
    target = Path(__file__).resolve().parent.parent / "engine" / "fixtures" / "distribution-reference.json"
    target.write_text(json.dumps(out, indent=1, allow_nan=False) + "\n")
    print(f"wrote {target}: " + ", ".join(f"{k} {len(v)}" for k, v in out.items()))
    print("skipped:", *skipped, sep="\n  ")


if __name__ == "__main__":
    main()
