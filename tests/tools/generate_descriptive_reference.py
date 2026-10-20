# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["numpy==2.1.3", "scipy==1.14.1"]
# ///
"""Reference values for the descriptive statistics, from numpy and scipy.

Writes tests/engine/fixtures/descriptive-reference.json, which tests/engine/test_descriptive.ts
compares the engine against at a relative error of 1e-9. Each function is matched to the library
routine that defines the same quantity:
  PERCENTILE.EXC  numpy.percentile(method="weibull")      SKEW.P   scipy.stats.skew(bias=True)
  AVEDEV          mean(|x - mean|)                        DEVSQ    sum((x - mean)^2)
  RANK.AVG        scipy.stats.rankdata(method="average")  SPEARMAN scipy.stats.spearmanr
  KENDALL         scipy.stats.kendalltau (tau-b)
Regenerate with:  uv run tests/tools/generate_descriptive_reference.py
"""

import json
import random
from pathlib import Path

import numpy as np
from scipy import stats

SEED = 20261020
CASES = 80


def sample(rng, count):
    # Rounded values make ties, which rank and rank-correlation answers depend on.
    return [round(rng.uniform(-50, 150), rng.choice([0, 1, 2])) for _ in range(count)]


def case(rng):
    count = rng.randint(4, 40)
    xs, ys = sample(rng, count), sample(rng, count)
    k = rng.uniform(1 / (count + 1), count / (count + 1))
    target = rng.choice(xs)
    descending_ranks = stats.rankdata([-x for x in xs], method="average")
    return {
        "xs": xs,
        "ys": ys,
        "k": k,
        "percentileExc": float(np.percentile(xs, k * 100, method="weibull")),
        "skewP": float(stats.skew(xs, bias=True)),
        "avedev": float(np.mean(np.abs(np.array(xs) - np.mean(xs)))),
        "devsq": float(np.sum((np.array(xs) - np.mean(xs)) ** 2)),
        "rankTarget": target,
        "rankAvgDescending": float(descending_ranks[xs.index(target)]),
        "spearman": float(stats.spearmanr(xs, ys).statistic),
        "kendall": float(stats.kendalltau(xs, ys).statistic),
    }


def main():
    rng = random.Random(SEED)
    cases = [case(rng) for _ in range(CASES)]
    out = Path(__file__).resolve().parent.parent / "engine" / "fixtures" / "descriptive-reference.json"
    out.write_text(json.dumps({"seed": SEED, "cases": cases}, indent=1) + "\n")
    print(f"wrote {len(cases)} cases to {out}")


main()
