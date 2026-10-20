# /// script
# requires-python = ">=3.10"
# dependencies = ["mpmath==1.3.0"]
# ///
"""Reference values for the chi-square, F, gamma, beta, lognormal, Weibull, exponential, binomial,
Poisson, hypergeometric and negative binomial distributions, at 50 significant digits.

Writes tests/engine/fixtures/distribution-families-reference.json, which
tests/engine/test_distributionFamilies.ts compares the engine against at a relative error of 1e-9.
Each case is an Excel formula and the value it should answer. Inverses are found by bisecting
the 50-digit cumulative function 400 times.
Regenerate with:  uv run tests/tools/generate_distribution_families_reference.py
"""

import json
from pathlib import Path

from mpmath import mp, mpf, betainc, binomial, exp, expm1, gammainc, log, loggamma, sqrt, pi, erfc

mp.dps = 50


def chisq_cdf(x, k):
    return gammainc(mpf(k) / 2, 0, mpf(x) / 2, regularized=True)


def chisq_upper(x, k):
    return gammainc(mpf(k) / 2, mpf(x) / 2, mp.inf, regularized=True)


def chisq_pdf(x, k):
    x, k = mpf(x), mpf(k)
    return exp((k / 2 - 1) * log(x) - x / 2 - (k / 2) * log(2) - loggamma(k / 2))


def f_cdf(x, d1, d2):
    x = mpf(x)
    return betainc(mpf(d1) / 2, mpf(d2) / 2, 0, d1 * x / (d1 * x + d2), regularized=True)


def f_upper(x, d1, d2):
    x = mpf(x)
    return betainc(mpf(d2) / 2, mpf(d1) / 2, 0, d2 / (d1 * x + d2), regularized=True)


def f_pdf(x, d1, d2):
    x, d1, d2 = mpf(x), mpf(d1), mpf(d2)
    return exp((d1 * log(d1 * x) + d2 * log(d2) - (d1 + d2) * log(d1 * x + d2)) / 2 - log(x) - (loggamma(d1 / 2) + loggamma(d2 / 2) - loggamma((d1 + d2) / 2)))


def gamma_cdf(x, a, b):
    return gammainc(mpf(a), 0, mpf(x) / b, regularized=True)


def gamma_pdf(x, a, b):
    x, a, b = mpf(x), mpf(a), mpf(b)
    return exp((a - 1) * log(x) - x / b - a * log(b) - loggamma(a))


def beta_cdf(x, a, b):
    return betainc(mpf(a), mpf(b), 0, mpf(x), regularized=True)


def beta_pdf(x, a, b):
    x, a, b = mpf(x), mpf(a), mpf(b)
    return exp((a - 1) * log(x) + (b - 1) * log(1 - x) - (loggamma(a) + loggamma(b) - loggamma(a + b)))


def normal_cdf(z):
    return erfc(-mpf(z) / sqrt(2)) / 2


def binom_pmf(s, n, p):
    p = mpf(p)
    return binomial(n, s) * p**s * (1 - p) ** (n - s)


def binom_cdf(s, n, p):
    return sum(binom_pmf(i, n, p) for i in range(s + 1))


def poisson_pmf(k, m):
    m = mpf(m)
    return exp(k * log(m) - m - loggamma(k + 1))


def hypgeom_pmf(k, n, K, N):
    return binomial(K, k) * binomial(N - K, n - k) / binomial(N, n)


def negbinom_pmf(f, s, p):
    p = mpf(p)
    return binomial(f + s - 1, f) * p**s * (1 - p) ** f


def bisect(cdf, p, low=mpf(0), high=mpf(1)):
    while cdf(high) < p:
        high *= 2
    for _ in range(400):
        middle = (low + high) / 2
        if cdf(middle) < p:
            low = middle
        else:
            high = middle
    return (low + high) / 2


def bisect_unit(cdf, p):
    low, high = mpf(0), mpf(1)
    for _ in range(400):
        middle = (low + high) / 2
        if cdf(middle) < p:
            low = middle
        else:
            high = middle
    return (low + high) / 2


cases = []


def add(formula, value):
    cases.append({"formula": formula, "value": value if isinstance(value, int) else mp.nstr(value, 25)})


for k in [1, 2, 3, 5, 10, 30, 100, 1000]:
    for x in ["0.001", "0.5", "1", "3", "10", "40", "200", "1500"]:
        add(f"=CHISQ.DIST({x},{k},TRUE)", chisq_cdf(mpf(x), k))
        add(f"=CHISQ.DIST.RT({x},{k})", chisq_upper(mpf(x), k))
        add(f"=CHISQ.DIST({x},{k},FALSE)", chisq_pdf(mpf(x), k))
    for p in ["1e-10", "0.01", "0.3", "0.5", "0.9", "0.999"]:
        add(f"=CHISQ.INV({p},{k})", bisect(lambda x: chisq_cdf(x, k), mpf(p)))
        add(f"=CHISQ.INV.RT({p},{k})", bisect(lambda x: -chisq_upper(x, k), -mpf(p)))

for d1, d2 in [(1, 1), (2, 5), (6, 4), (10, 30), (50, 3), (100, 200)]:
    for x in ["0.01", "0.5", "1", "2.5", "15.2069", "100"]:
        add(f"=F.DIST({x},{d1},{d2},TRUE)", f_cdf(mpf(x), d1, d2))
        add(f"=F.DIST.RT({x},{d1},{d2})", f_upper(mpf(x), d1, d2))
        add(f"=F.DIST({x},{d1},{d2},FALSE)", f_pdf(mpf(x), d1, d2))
    for p in ["1e-8", "0.01", "0.5", "0.95"]:
        add(f"=F.INV({p},{d1},{d2})", bisect(lambda x: f_cdf(x, d1, d2), mpf(p)))
        add(f"=F.INV.RT({p},{d1},{d2})", bisect(lambda x: -f_upper(x, d1, d2), -mpf(p)))

for a, b in [("0.5", "1"), ("1", "2"), ("2.5", "0.5"), ("9", "2"), ("40", "3")]:
    for x in ["0.01", "0.7", "3", "18", "150"]:
        add(f"=GAMMA.DIST({x},{a},{b},TRUE)", gamma_cdf(mpf(x), mpf(a), mpf(b)))
        add(f"=GAMMA.DIST({x},{a},{b},FALSE)", gamma_pdf(mpf(x), mpf(a), mpf(b)))
    for p in ["1e-9", "0.2", "0.5", "0.99"]:
        add(f"=GAMMA.INV({p},{a},{b})", bisect(lambda x: gamma_cdf(x, mpf(a), mpf(b)), mpf(p)))

for a, b in [("0.5", "0.5"), ("1", "3"), ("2", "5"), ("8", "10"), ("30", "2")]:
    for x in ["0.001", "0.2", "0.5", "0.8", "0.999"]:
        add(f"=BETA.DIST({x},{a},{b},TRUE)", beta_cdf(mpf(x), mpf(a), mpf(b)))
        add(f"=BETA.DIST({x},{a},{b},FALSE)", beta_pdf(mpf(x), mpf(a), mpf(b)))
    for p in ["1e-7", "0.25", "0.5", "0.9"]:
        add(f"=BETA.INV({p},{a},{b})", bisect_unit(lambda x: beta_cdf(x, mpf(a), mpf(b)), mpf(p)))

for m, s in [("0", "1"), ("3.5", "1.2"), ("-1", "0.3")]:
    for x in ["0.05", "1", "4", "60"]:
        z = (log(mpf(x)) - mpf(m)) / mpf(s)
        add(f"=LOGNORM.DIST({x},{m},{s},TRUE)", normal_cdf(z))
        add(f"=LOGNORM.DIST({x},{m},{s},FALSE)", exp(-z * z / 2) / (mpf(x) * mpf(s) * sqrt(2 * pi)))

for a, b in [("0.5", "2"), ("1", "1"), ("20", "100")]:
    for x in ["0.1", "1", "105"]:
        add(f"=WEIBULL.DIST({x},{a},{b},TRUE)", -expm1(-((mpf(x) / mpf(b)) ** mpf(a))))
for lam in ["0.5", "10"]:
    for x in ["0.01", "0.2", "3"]:
        add(f"=EXPON.DIST({x},{lam},TRUE)", -expm1(-mpf(lam) * mpf(x)))

for n, p in [(10, "0.5"), (30, "0.1"), (100, "0.97"), (400, "0.3")]:
    for s in [0, 1, n // 3, n // 2, n - 1, n]:
        add(f"=BINOM.DIST({s},{n},{p},FALSE)", binom_pmf(s, n, mpf(p)))
        add(f"=BINOM.DIST({s},{n},{p},TRUE)", binom_cdf(s, n, mpf(p)))
    for alpha in ["0.001", "0.3", "0.75", "0.999"]:
        k = next(i for i in range(n + 1) if binom_cdf(i, n, mpf(p)) >= mpf(alpha))
        add(f"=BINOM.INV({n},{p},{alpha})", k)

for m in ["0.1", "5", "40"]:
    for k in [0, 1, 3, 10, 60]:
        add(f"=POISSON.DIST({k},{m},FALSE)", poisson_pmf(k, mpf(m)))
        add(f"=POISSON.DIST({k},{m},TRUE)", sum(poisson_pmf(i, mpf(m)) for i in range(k + 1)))

for k, n, K, N in [(1, 4, 8, 20), (0, 5, 10, 50), (3, 10, 12, 30), (20, 40, 60, 100)]:
    add(f"=HYPGEOM.DIST({k},{n},{K},{N},FALSE)", hypgeom_pmf(k, n, K, N))
    add(f"=HYPGEOM.DIST({k},{n},{K},{N},TRUE)", sum(hypgeom_pmf(i, n, K, N) for i in range(max(0, n - N + K), k + 1)))

for f, s, p in [(10, 5, "0.25"), (0, 1, "0.5"), (30, 3, "0.1"), (5, 20, "0.8")]:
    add(f"=NEGBINOM.DIST({f},{s},{p},FALSE)", negbinom_pmf(f, s, mpf(p)))
    add(f"=NEGBINOM.DIST({f},{s},{p},TRUE)", sum(negbinom_pmf(i, s, mpf(p)) for i in range(f + 1)))

for x in ["0.5", "4", "30.5", "170"]:
    add(f"=GAMMALN({x})", loggamma(mpf(x)))

out = Path(__file__).resolve().parent.parent / "engine" / "fixtures" / "distribution-families-reference.json"
out.write_text(json.dumps({"digits": mp.dps, "cases": cases}, indent=1) + "\n")
print(f"wrote {len(cases)} cases to {out}")
