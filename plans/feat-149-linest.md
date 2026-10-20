# #149 part 1 — LINEST, LOGEST, TREND over several x, GROWTH

## What
- `LINEST(known_y, [known_x], [const], [stats])` and `LOGEST(…)`: least squares over one or more x variables, answering Excel's table (coefficients from the last x to the first, then the constant; with stats, the standard errors, r², sey, F, df, ssreg and ssresid, `#N/A` padding).
- `TREND` at a table of new x (or known_x when new_x is left out), over one or more variables; `GROWTH` likewise for the exponential curve.

## How
- `linest-math.ts` (pure): the design (constant first) is orthogonalised by modified Gram–Schmidt, twice per column, with an unnormalised basis so exact data fits exactly. A column collinear with the ones kept before it is left out (coefficient and standard error 0, one more degree of freedom), as Excel documents.
- Shapes as Excel reads them: x of y's own shape is one variable; y a column → each column of x a variable; y a row → each row. Otherwise `#REF!`.
- TREND at one new x keeps its existing code path untouched; at a table of new x, one variable is predicted through the same `trendAt`, so a cell answers what TREND at that x alone answers.

## Decisions
- A statistic that divides by 0 (no degrees of freedom, a perfect fit's F, r² when every y is the same) is `#NUM!`.
- Collinearity tolerance: a column whose part unexplained by the earlier columns is below 1e-10 of its own size.

## Not in this part
- `FORECAST.ETS` and its family (Holt-Winters): Excel's fitting procedure is not documented closely enough to reproduce its numbers; a separate PR decides how to test it.
- Polynomial fits written `x^{1,2,3}`: need array expressions (#172).
- Logistic regression (not in Excel): not added; a workbook function (QuickJS) can fit it.
