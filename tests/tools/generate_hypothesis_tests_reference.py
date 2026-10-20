# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["mpmath==1.3.0", "numpy==2.2.6", "scipy==1.15.3"]
# ///
"""Reference p values for F.TEST, Z.TEST, CHISQ.TEST, ANOVA.TEST, MANNWHITNEY.TEST, WILCOXON.TEST,
KS.TEST and SHAPIRO.TEST.

Writes tests/engine/fixtures/hypothesis-tests-reference.json, which tests/engine/test_hypothesisTests.ts
compares the engine against at a relative error of 1e-9. Each p value is computed here independently
of the engine: the F, chi-square and normal tails with mpmath at 50 digits, the exact rank
distributions by counting in Python integers, and the exact Kolmogorov-Smirnov p by counting
lattice paths, SHAPIRO.TEST by Royston's AS R94 at 50 digits. Each is checked against scipy.stats
where scipy computes the same quantity (mannwhitneyu, wilcoxon and ks_2samp with an explicit method,
f_oneway, and shapiro to the 7 digits its normal quantile carries).
Regenerate with:  uv run tests/tools/generate_hypothesis_tests_reference.py
"""

import json
import random
from fractions import Fraction
from math import comb
from pathlib import Path

import numpy as np
from mpmath import betainc, exp, gammainc, mp, mpf, ncdf, pi, sqrt
from scipy import special, stats

mp.dps = 50
SEED = 152
OUT = Path(__file__).resolve().parents[1] / "engine" / "fixtures" / "hypothesis-tests-reference.json"
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

cases = []


def range_of(column, length):
    return f"{LETTERS[column]}1:{LETTERS[column]}{length}"


def add(formula, columns, value, check=None, tolerance=1e-12):
    value = mpf(value)
    if check is not None:
        assert abs(float(value) - check) <= tolerance * max(abs(float(value)), 1e-300), (formula, value, check)
    cases.append({"formula": formula, "columns": columns, "value": mp.nstr(value, 25)})


def f_cdf(x, d1, d2):
    return betainc(mpf(d1) / 2, mpf(d2) / 2, 0, d1 * x / (d1 * x + d2), regularized=True)


def f_upper(x, d1, d2):
    return betainc(mpf(d2) / 2, mpf(d1) / 2, 0, d2 / (d1 * x + d2), regularized=True)


def chisq_upper(x, k):
    return gammainc(mpf(k) / 2, mpf(x) / 2, mp.inf, regularized=True)


def sample_variance(values):
    values = [mpf(v) for v in values]
    mean = sum(values) / len(values)
    return mean, sum((v - mean) ** 2 for v in values) / (len(values) - 1)


def mid_ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks, ties, start = [Fraction(0)] * len(values), [], 0
    while start < len(order):
        stop = start
        while stop < len(order) and values[order[stop]] == values[order[start]]:
            stop += 1
        for position in range(start, stop):
            ranks[order[position]] = Fraction(start + 1 + stop, 2)
        ties.append(stop - start)
        start = stop
    return ranks, ties


def two_sided_normal(z):
    return min(mpf(1), 2 * ncdf(-abs(z)))


rng = random.Random(SEED)


def decimals(count, low=0.0, high=50.0):
    return [round(rng.uniform(low, high), 2) for _ in range(count)]


def distinct_decimals(count, low=0.0, high=50.0):
    values = set()
    while len(values) < count:
        values.add(round(rng.uniform(low, high), 2))
    return rng.sample(sorted(values), count)


def integers(count, low, high):
    return [rng.randint(low, high) for _ in range(count)]


# ---------------------------------------------------------------- F.TEST

for _ in range(25):
    first, second = decimals(rng.randint(2, 30)), decimals(rng.randint(2, 30), -20, rng.choice([10, 60, 200]))
    (_, v1), (_, v2) = sample_variance(first), sample_variance(second)
    ratio, d1, d2 = v1 / v2, len(first) - 1, len(second) - 1
    p = min(mpf(1), 2 * min(f_cdf(ratio, d1, d2), f_upper(ratio, d1, d2)))
    add(f"=F.TEST({range_of(0, len(first))},{range_of(1, len(second))})", [first, second], p)

# ---------------------------------------------------------------- Z.TEST

for _ in range(25):
    values = decimals(rng.randint(2, 40))
    mean, variance = sample_variance(values)
    x = round(rng.uniform(10, 40), 2)
    sigma = rng.choice([None, round(rng.uniform(1, 20), 2)])
    sd = sqrt(variance) if sigma is None else mpf(sigma)
    p = ncdf(-(mean - x) / (sd / sqrt(len(values))))
    extra = "" if sigma is None else f",{sigma}"
    add(f"=Z.TEST({range_of(0, len(values))},{x}{extra})", [values], p)

# ---------------------------------------------------------------- CHISQ.TEST

for rows, cols in [(1, 2), (1, 5), (4, 1), (2, 2), (2, 3), (3, 2), (3, 4), (5, 5), (2, 7)]:
    for _ in range(3):
        observed = [integers(rows, 0, 60) for _ in range(cols)]
        expected = [decimals(rows, 1, 60) for _ in range(cols)]
        statistic = sum((mpf(o) - mpf(e)) ** 2 / mpf(e) for oc, ec in zip(observed, expected) for o, e in zip(oc, ec))
        degrees = (rows - 1) * (cols - 1) if rows > 1 and cols > 1 else rows * cols - 1
        last_obs, first_exp = LETTERS[cols - 1], LETTERS[cols]
        last_exp = LETTERS[2 * cols - 1]
        formula = f"=CHISQ.TEST(A1:{last_obs}{rows},{first_exp}1:{last_exp}{rows})"
        add(formula, observed + expected, chisq_upper(statistic, degrees))

# ---------------------------------------------------------------- ANOVA.TEST

for _ in range(25):
    groups = [decimals(rng.randint(1, 15), 0, rng.choice([20, 50])) for _ in range(rng.randint(2, 5))]
    if sum(len(g) for g in groups) == len(groups):
        groups[0].append(1.5)
    values = [mpf(v) for g in groups for v in g]
    grand = sum(values) / len(values)
    means = [sum(mpf(v) for v in g) / len(g) for g in groups]
    between = sum(len(g) * (m - grand) ** 2 for g, m in zip(groups, means))
    within = sum((mpf(v) - m) ** 2 for g, m in zip(groups, means) for v in g)
    dfb, dfw = len(groups) - 1, len(values) - len(groups)
    p = f_upper((between / dfb) / (within / dfw), dfb, dfw)
    check = stats.f_oneway(*groups).pvalue
    ranges = ",".join(range_of(i, len(g)) for i, g in enumerate(groups))
    add(f"=ANOVA.TEST({ranges})", groups, p, check, 1e-9)

# ---------------------------------------------------------------- MANNWHITNEY.TEST


def mann_whitney_exact_upper(u, m, n):
    """P(U >= u): the m-subsets of the ranks 1..m+n by their sum, counted."""
    total = m + n
    ways = [[0] * (total * (total + 1) // 2 + 1) for _ in range(m + 1)]
    ways[0][0] = 1
    for rank in range(1, total + 1):
        for k in range(min(m, rank), 0, -1):
            for s in range(len(ways[k]) - 1, rank - 1, -1):
                ways[k][s] += ways[k - 1][s - rank]
    offset = m * (m + 1) // 2
    hits = sum(count for s, count in enumerate(ways[m]) if s - offset >= u)
    return Fraction(hits, comb(total, m))


def mann_whitney(first, second):
    m, n = len(first), len(second)
    ranks, ties = mid_ranks(first + second)
    u1 = sum(ranks[:m]) - Fraction(m * (m + 1), 2)
    u = max(u1, m * n - u1)
    if min(m, n) <= 8 and max(ties) == 1:
        exact = mann_whitney_exact_upper(u, m, n)
        return min(mpf(1), 2 * mpf(exact.numerator) / exact.denominator), "exact"
    total = m + n
    spread = sqrt(mpf(m * n) / 12 * ((total + 1) - mpf(sum(t**3 - t for t in ties)) / (total * (total - 1))))
    z = (mpf(u.numerator) / u.denominator - mpf(m * n) / 2 - mpf(1) / 2) / spread
    return min(mpf(1), 2 * ncdf(-z)), "asymptotic"


for sizes, tied in [((3, 4), False), ((5, 8), False), ((8, 20), False), ((2, 30), False), ((6, 6), True), ((12, 15), False), ((12, 15), True), ((30, 40), True), ((9, 9), False)]:
    for _ in range(3):
        m, n = sizes
        pool = integers(m + n, 0, 12) if tied else distinct_decimals(m + n)
        first, second = pool[:m], pool[m:]
        p, method = mann_whitney(first, second)
        check = stats.mannwhitneyu(first, second, method=method).pvalue
        add(f"=MANNWHITNEY.TEST({range_of(0, m)},{range_of(1, n)})", [first, second], p, check, 1e-9)

# ---------------------------------------------------------------- WILCOXON.TEST


def wilcoxon_exact_lower(t, n):
    """P(W <= t): the subsets of the ranks 1..n by their sum, counted."""
    ways = [0] * (n * (n + 1) // 2 + 1)
    ways[0] = 1
    for rank in range(1, n + 1):
        for s in range(len(ways) - 1, rank - 1, -1):
            ways[s] += ways[s - rank]
    return Fraction(sum(ways[: int(t) + 1]), 2**n)


def wilcoxon(differences):
    nonzero = [d for d in differences if d != 0]
    n = len(nonzero)
    ranks, ties = mid_ranks([abs(d) for d in nonzero])
    positive = sum(r for r, d in zip(ranks, nonzero) if d > 0)
    smaller = min(positive, Fraction(n * (n + 1), 2) - positive)
    if n == len(differences) and n <= 50 and max(ties) == 1:
        lower = wilcoxon_exact_lower(smaller, n)
        return min(mpf(1), 2 * mpf(lower.numerator) / lower.denominator), "exact"
    spread = sqrt(mpf(n * (n + 1) * (2 * n + 1)) / 24 - mpf(sum(t**3 - t for t in ties)) / 48)
    return two_sided_normal((mpf(positive.numerator) / positive.denominator - mpf(n * (n + 1)) / 4) / spread), "approx"


for size, kind in [(5, "distinct"), (9, "distinct"), (20, "distinct"), (45, "distinct"), (50, "distinct"), (51, "distinct"), (60, "distinct"), (12, "ties"), (25, "zeros"), (14, "one zero"), (30, "ties")]:
    for _ in range(3):
        if kind in ("distinct", "one zero"):
            differences = distinct_decimals(size, -20, 30)
            if kind == "one zero":
                differences[0] = 0
        else:
            differences = integers(size, -6, 9)
            if kind == "zeros":
                differences[0] = differences[1] = 0
        first = decimals(size)
        second = [round(a - d, 2) for a, d in zip(first, differences)]
        # As the engine forms them: in doubles, so ties and zeros agree.
        actual = [a - b for a, b in zip(first, second)]
        p, method = wilcoxon(actual)
        check = stats.wilcoxon(actual, method=method, correction=False).pvalue
        add(f"=WILCOXON.TEST({range_of(0, size)},{range_of(1, size)})", [first, second], p, check, 1e-9)
        p_one, method_one = wilcoxon(first)
        add(f"=WILCOXON.TEST({range_of(0, size)})", [first], p_one, stats.wilcoxon(first, method=method_one, correction=False).pvalue, 1e-9)

# ---------------------------------------------------------------- KS.TEST


def largest_gap(first, second):
    m, n = len(first), len(second)
    gap = 0
    for value in sorted(set(first + second)):
        i, j = sum(1 for v in first if v <= value), sum(1 for v in second if v <= value)
        gap = max(gap, abs(i * n - j * m))
    return gap


def ks_exact(first, second):
    """P(D >= d): monotone lattice paths that reach |i*n - j*m| >= gap after a whole block of tied
    values (where D is observed), counted."""
    m, n = len(first), len(second)
    gap = largest_gap(first, second)
    pooled = sorted(first + second)
    observed = [k > 0 and (k == m + n or pooled[k - 1] != pooled[k]) for k in range(m + n + 1)]
    inside = [[0] * (n + 1) for _ in range(m + 1)]
    outside = 0
    for i in range(m + 1):
        for j in range(n + 1):
            arriving = 1 if i == j == 0 else (inside[i - 1][j] if i else 0) + (inside[i][j - 1] if j else 0)
            if observed[i + j] and abs(i * n - j * m) >= gap:
                outside += arriving * comb(m - i + n - j, m - i)
            else:
                inside[i][j] = arriving
    return Fraction(outside, comb(m + n, m))


def ks_by_permutation(first, second):
    """P(D >= d) by trying every way of labelling the pooled values as the two samples: an
    independent check of the lattice count, ties included, for small samples."""
    from itertools import combinations

    pooled, m = first + second, len(first)
    observed = largest_gap(first, second)
    hits = total = 0
    for chosen in combinations(range(len(pooled)), m):
        picked = set(chosen)
        left = [pooled[k] for k in picked]
        right = [pooled[k] for k in range(len(pooled)) if k not in picked]
        hits += largest_gap(left, right) >= observed
        total += 1
    return Fraction(hits, total)


def kolmogorov_upper(lam):
    """Kolmogorov's limit 2 * sum (-1)^(k-1) exp(-2 k^2 lam^2), as 1 - theta_4(0, exp(-2 lam^2))."""
    return 1 - mp.jtheta(4, 0, exp(-2 * lam * lam))


for m, n, tied in [(3, 4, False), (5, 5, False), (8, 13, False), (20, 25, False), (40, 40, False), (60, 35, False), (6, 7, True), (7, 8, True), (15, 22, True), (100, 120, False)]:
    for _ in range(3):
        pool = integers(m + n, 0, 6 if m + n <= 15 else 15) if tied else distinct_decimals(m + n, 0, 100)
        shift = rng.choice([0, 5, 20])
        first, second = pool[:m], [round(v + shift, 2) for v in pool[m:]]
        exact = ks_exact(first, second)
        if m + n <= 15:
            assert exact == ks_by_permutation(first, second), (first, second)
        p = min(mpf(1), mpf(exact.numerator) / exact.denominator)
        # scipy's exact p assumes no ties, so it is a check only where nothing ties.
        untied = len(set(first + second)) == m + n
        check = stats.ks_2samp(first, second, method="exact").pvalue if untied and float(p) > 1e-6 else None
        add(f"=KS.TEST({range_of(0, m)},{range_of(1, n)})", [first, second], p, check, 1e-6)

for size, shift in [(3200, 0), (3200, 1), (3300, 3), (3200, None)]:
    if shift is None:  # interleaved, so D is 1/size and lambda is near 0
        first, second = list(range(0, 2 * size, 2)), list(range(1, 2 * size, 2))
    else:
        pool = rng.sample(range(10**7), 2 * size)
        first, second = pool[:size], [v + shift * 10**4 for v in pool[size:]]
    gap = largest_gap(first, second)
    lam = mpf(gap) / (size * size) * sqrt(mpf(size * size) / (2 * size))
    add(f"=KS.TEST({range_of(0, size)},{range_of(1, size)})", [first, second], kolmogorov_upper(lam), float(special.kolmogorov(float(lam))), 1e-9)

# ---------------------------------------------------------------- SHAPIRO.TEST
# Royston's AS R94 with an exact normal quantile and tail, as R's swilk.c has it. scipy keeps the
# published 7-digit quantile (AS 241 PPND7) and AS 66's tail, so it agrees only to about 1e-7.


def poly(coefficients, x):
    return sum(mpf(c) * mpf(x) ** k for k, c in enumerate(coefficients))


def shapiro_p(values):
    n = len(values)
    x = sorted(mpf(v) for v in values)
    if n == 3:
        a = [sqrt(mpf(1) / 2)]
    else:
        half = n // 2
        m = [sqrt(2) * mp.erfinv(2 * ((i + 1 - mpf("0.375")) / (n + mpf("0.25"))) - 1) for i in range(half)]
        summ2 = 2 * sum(v * v for v in m)
        rsn = 1 / sqrt(n)
        a1 = poly([0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], rsn) - m[0] / sqrt(summ2)
        if n > 5:
            a2 = -m[1] / sqrt(summ2) + poly([0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633], rsn)
            fac = sqrt((summ2 - 2 * m[0] ** 2 - 2 * m[1] ** 2) / (1 - 2 * a1**2 - 2 * a2**2))
            a = [a1, a2] + [-v / fac for v in m[2:]]
        else:
            fac = sqrt((summ2 - 2 * m[0] ** 2) / (1 - 2 * a1**2))
            a = [a1] + [-v / fac for v in m[1:]]
    weights = [0 if i == n - 1 - i else (1 if i > n - 1 - i else -1) * a[min(i, n - 1 - i)] for i in range(n)]
    mean = sum(x) / n
    w = sum(c * v for c, v in zip(weights, x)) ** 2 / (sum(c * c for c in weights) * sum((v - mean) ** 2 for v in x))
    if n == 3:
        return max(mpf(0), 6 / pi * (mp.asin(sqrt(w)) - pi / 3))
    y = mp.log(1 - w)
    if n <= 11:
        gamma = poly([-2.273, 0.459], n)
        if y >= gamma:
            return mpf("1e-99")
        y = -mp.log(gamma - y)
        mean_y, sd_y = poly([0.544, -0.39978, 0.025054, -6.714e-4], n), exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n))
    else:
        mean_y, sd_y = poly([-1.5861, -0.31082, -0.083751, 0.0038915], mp.log(n)), exp(poly([-0.4803, -0.082676, 0.0030302], mp.log(n)))
    return ncdf(-(y - mean_y) / sd_y)


for size in [3, 3, 4, 5, 6, 7, 9, 11, 12, 15, 20, 30, 50, 100, 400, 2000]:
    for shape in ["normal", "skewed"]:
        values = [round(rng.gauss(10, 3) if shape == "normal" else rng.expovariate(0.3), 3) for _ in range(size)]
        add(f"=SHAPIRO.TEST({range_of(0, size)})", [values], shapiro_p(values), stats.shapiro(np.array(values)).pvalue, 1e-6)

OUT.write_text(json.dumps({"seed": SEED, "cases": cases}, indent=1) + "\n")
print(f"{len(cases)} cases -> {OUT}")
