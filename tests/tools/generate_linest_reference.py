# /// script
# requires-python = ">=3.10"
# dependencies = ["mpmath==1.3.0"]
# ///
"""Reference tables for LINEST, LOGEST, TREND and GROWTH.

The least-squares solution is solved exactly, in rational arithmetic over the inputs' decimals (or at
50 significant digits for LOGEST's and GROWTH's ln y). A column that is an exact linear combination
of the columns before it (the constant first) is left out with coefficient and standard error 0, as
Excel documents. Writes tests/engine/fixtures/linest-reference.json, which
tests/engine/test_linest.ts compares the engine against at a relative error of 1e-9.
Regenerate with:  uv run tests/tools/generate_linest_reference.py
"""

import json
import random
from fractions import Fraction
from pathlib import Path

from mpmath import mp, mpf, sqrt, log, exp

mp.dps = 50
NA, NUM = "#N/A", "#NUM!"


def to_mp(value):
    return mpf(value.numerator) / mpf(value.denominator) if isinstance(value, Fraction) else mpf(value)


def solve(matrix, vector, field):
    """Gauss–Jordan elimination on a square, invertible matrix; returns the solution and the inverse."""
    n = len(matrix)
    a = [[field(v) for v in row] + [field(1) if i == j else field(0) for j in range(n)] + [field(vector[i])] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        a[col], a[pivot] = a[pivot], a[col]
        p = a[col][col]
        a[col] = [v / p for v in a[col]]
        for r in range(n):
            if r != col and a[r][col] != 0:
                f = a[r][col]
                a[r] = [v - f * w for v, w in zip(a[r], a[col])]
    return [row[-1] for row in a], [row[n:2 * n] for row in a]


def rank(columns):
    rows = [list(r) for r in zip(*columns)] if columns else []
    m = [[Fraction(v) for v in row] for row in rows]
    rk, col_count = 0, len(columns)
    for col in range(col_count):
        pivot = next((r for r in range(rk, len(m)) if m[r][col] != 0), None)
        if pivot is None:
            continue
        m[rk], m[pivot] = m[pivot], m[rk]
        for r in range(len(m)):
            if r != rk and m[r][col] != 0:
                f = m[r][col] / m[rk][col]
                m[r] = [v - f * w for v, w in zip(m[r], m[rk])]
        rk += 1
    return rk


def fit(ys, columns, with_constant, field):
    """Coefficients per variable (0 when left out), the constant, kept flags and the inverse's diagonal."""
    design = ([[1] * len(ys)] if with_constant else []) + columns
    kept, chosen = [], []
    for column in design:
        exact = [Fraction(str(v)) for v in column]
        if rank(chosen + [exact]) > len(chosen):
            chosen.append(exact)
            kept.append(True)
        else:
            kept.append(False)
    x = [[c[i] if field is Fraction else to_mp(c[i]) for c in chosen] for i in range(len(ys))]
    xtx = [[sum(x[r][i] * x[r][j] for r in range(len(ys))) for j in range(len(chosen))] for i in range(len(chosen))]
    xty = [sum(x[r][i] * field(ys[r]) for r in range(len(ys))) for i in range(len(chosen))]
    solution, inverse = solve(xtx, xty, field)
    values, diagonal, k = [], [], 0
    for is_kept in kept:
        values.append(solution[k] if is_kept else field(0))
        diagonal.append(inverse[k][k] if is_kept else field(0))
        k += 1 if is_kept else 0
    offset = 1 if with_constant else 0
    return {
        "coefficients": values[offset:],
        "intercept": values[0] if with_constant else field(0),
        "kept": kept[offset:],
        "diagonal": diagonal[offset:],
        "intercept_diagonal": diagonal[0] if with_constant else None,
        "with_constant": with_constant,
    }


def predict(f, xs):
    return f["intercept"] + sum(c * x for c, x in zip(f["coefficients"], xs))


def table(f, ys, columns, stats, field):
    width = len(f["coefficients"]) + 1
    first = list(reversed(f["coefficients"])) + [f["intercept"]]
    if not stats:
        return [first]
    n = len(ys)
    fitted = [predict(f, [c[i] for c in columns]) for i in range(n)]
    ysf = [field(y) for y in ys]
    mean = sum(ysf) / n
    ssresid = sum((y - v) ** 2 for y, v in zip(ysf, fitted))
    ssreg = sum(((v - mean) if f["with_constant"] else v) ** 2 for v in fitted)
    sstotal = sum(((y - mean) if f["with_constant"] else y) ** 2 for y in ysf)
    kept = sum(f["kept"])
    df = n - kept - (1 if f["with_constant"] else 0)
    variance = NUM if df == 0 else ssresid / df
    sey = NUM if variance == NUM else sqrt(to_mp(variance))
    def error(d, is_kept):
        if not is_kept:
            return 0
        return NUM if sey == NUM else sey * sqrt(to_mp(d))
    errors = [error(d, k) for d, k in zip(f["diagonal"], f["kept"])][::-1]
    intercept_error = NA if f["intercept_diagonal"] is None else error(f["intercept_diagonal"], True)
    reg_ms = NUM if kept == 0 else ssreg / kept
    f_stat = NUM if reg_ms == NUM or variance == NUM or variance == 0 else reg_ms / variance
    pad = lambda values: values + [NA] * (width - len(values))
    r2 = NUM if sstotal == 0 else ssreg / sstotal
    return [first, errors + [intercept_error], pad([r2, sey]), pad([f_stat, df]), pad([ssreg, ssresid])]


def out(grid):
    return [[v if isinstance(v, str) else float(to_mp(v)) for v in row] for row in grid]


def decimal(rng, low, high, digits=2):
    return round(rng.uniform(low, high), digits)


def regression_case(fn, y, x, with_constant, stats):
    """y and x as grids; the variables as Excel reads them."""
    ys = [v for row in y for v in row]
    if x is None:
        columns = [[i + 1 for i in range(len(ys))]]
    elif len(x) == len(y) and len(x[0]) == len(y[0]):
        columns = [[v for row in x for v in row]]
    elif len(y[0]) == 1:
        columns = [[row[c] for row in x] for c in range(len(x[0]))]
    else:
        columns = [list(row) for row in x]
    if fn == "LINEST":
        field = Fraction
        f = fit([Fraction(str(v)) for v in ys], [[Fraction(str(v)) for v in c] for c in columns], with_constant, field)
        expected = table(f, [Fraction(str(v)) for v in ys], [[Fraction(str(v)) for v in c] for c in columns], stats, field)
    else:
        field = mpf
        lys = [log(mpf(str(v))) for v in ys]
        f = fit(lys, [[mpf(str(v)) for v in c] for c in columns], with_constant, field)
        expected = table(f, lys, [[mpf(str(v)) for v in c] for c in columns], stats, field)
        expected[0] = [exp(v) for v in expected[0]]
    return {"fn": fn, "y": y, "x": x, "const": with_constant, "stats": stats, "expected": out(expected)}, f, columns


def curve_case(fn, y, x, new_x, with_constant):
    case, f, columns = regression_case("LINEST" if fn == "TREND" else "LOGEST", y, x, with_constant, False)
    k = len(columns)
    if k == 1:
        grid = [[predict(f, [Fraction(str(v)) if fn == "TREND" else mpf(str(v))]) for v in row] for row in new_x]
    elif len(y[0]) == 1:
        grid = [[predict(f, [Fraction(str(v)) if fn == "TREND" else mpf(str(v)) for v in row])] for row in new_x]
    else:
        grid = [[predict(f, [Fraction(str(new_x[r][c])) if fn == "TREND" else mpf(str(new_x[r][c])) for r in range(k)]) for c in range(len(new_x[0]))]]
    if fn == "GROWTH":
        grid = [[exp(v) for v in row] for row in grid]
    return {"fn": fn, "y": y, "x": x, "newX": new_x, "const": with_constant, "expected": out(grid)}


def column(values):
    return [[v] for v in values]


def main():
    rng = random.Random(149)
    cases = []
    # Microsoft's examples: a straight line, and the office buildings' multiple regression.
    cases.append(regression_case("LINEST", column([1, 9, 5, 7]), column([0, 4, 2, 3]), True, True)[0])
    buildings = [
        [2310, 2, 2, 20, 142000], [2333, 2, 2, 12, 144000], [2356, 3, 1.5, 33, 151000], [2379, 3, 2, 43, 150000],
        [2402, 2, 3, 53, 139000], [2425, 4, 2, 23, 169000], [2448, 2, 1.5, 99, 126000], [2471, 2, 2, 34, 142900],
        [2494, 3, 3, 23, 163000], [2517, 4, 4, 55, 169000], [2540, 2, 3, 22, 149000],
    ]
    cases.append(regression_case("LINEST", column([b[4] for b in buildings]), [b[:4] for b in buildings], True, True)[0])
    for _ in range(24):
        k = rng.randint(1, 4)
        n = rng.randint(k + 2, 12)
        x = [[decimal(rng, -20, 20) for _ in range(k)] for _ in range(n)]
        y = column([decimal(rng, -50, 50) for _ in range(n)])
        cases.append(regression_case("LINEST", y, x, rng.random() < 0.7, True)[0])
    # Collinear columns, a constant x beside the constant, an all-zero x through the origin, no degrees of freedom.
    xs = [1, 2, 4, 5, 7]
    cases.append(regression_case("LINEST", column([3, 5, 9, 11, 16]), [[v, 2 * v, v * v] for v in xs], True, True)[0])
    cases.append(regression_case("LINEST", column([3, 5, 9, 11, 16]), [[v, 2] for v in xs], True, True)[0])
    cases.append(regression_case("LINEST", column([3, 5, 9, 11, 16]), [[v, 0] for v in xs], False, True)[0])
    cases.append(regression_case("LINEST", column([3, 5, 9]), [[1, 2], [2, 7], [4, 1]], True, True)[0])
    cases.append(regression_case("LINEST", column([2, 4, 6, 8]), column([1, 2, 3, 4]), True, True)[0])
    # known_y a row, the variables in rows; x left out; one variable laid out as y is.
    cases.append(regression_case("LINEST", [[3, 5, 9, 11, 16]], [[1, 2, 4, 5, 7], [0, 1, 1, 3, 2]], True, True)[0])
    cases.append(regression_case("LINEST", column([3, 5, 9, 11]), None, True, True)[0])
    cases.append(regression_case("LINEST", [[1, 4], [9, 16]], [[1, 2], [3, 4]], True, False)[0])
    for _ in range(8):
        k = rng.randint(1, 3)
        n = rng.randint(k + 2, 10)
        x = [[decimal(rng, 0, 10) for _ in range(k)] for _ in range(n)]
        y = column([decimal(rng, 0.5, 200) for _ in range(n)])
        cases.append(regression_case("LOGEST", y, x, rng.random() < 0.7, True)[0])
    for fn in ["TREND", "GROWTH"]:
        for _ in range(6):
            k = rng.randint(2, 3)
            n = rng.randint(k + 2, 9)
            x = [[decimal(rng, 0, 10) for _ in range(k)] for _ in range(n)]
            y = column([decimal(rng, 0.5, 100) for _ in range(n)])
            new_x = [[decimal(rng, 0, 10) for _ in range(k)] for _ in range(rng.randint(1, 3))]
            cases.append(curve_case(fn, y, x, new_x, rng.random() < 0.7))
        cases.append(curve_case(fn, column([3, 5, 9, 11]), column([1, 2, 4, 5]), [[6, 7], [8, 9]], True))
        cases.append(curve_case(fn, [[3, 5, 9, 11, 16]], [[1, 2, 4, 5, 7], [0, 1, 1, 3, 2]], [[8, 9], [1, 2]], True))
    path = Path(__file__).resolve().parents[1] / "engine" / "fixtures" / "linest-reference.json"
    path.write_text(json.dumps(cases, indent=1) + "\n")
    print(f"wrote {len(cases)} cases to {path}")


if __name__ == "__main__":
    main()
