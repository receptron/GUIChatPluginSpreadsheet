# #156 — AUTOCORREL, EMA, DECOMPOSE

Not Excel functions; names chosen here. Each computes what statsmodels or pandas computes, and the reference values come from those libraries (`tests/tools/generate_time_series_reference.py`).

- `AUTOCORREL(values, lag)`: statsmodels `acf(adjusted=False)` at one lag. A lag that is not a whole number from 0 up to the length is #NUM!; a series that never varies #DIV/0!.
- `EMA(values, alpha)`: pandas `ewm(alpha, adjust=False).mean()`, one value per point, in the series' direction. alpha outside (0, 1] is #NUM!.
- `DECOMPOSE(values, period, [model])`: statsmodels `seasonal_decompose` (two-sided centred moving average, no extrapolation): trend, seasonal and residual per point; #N/A where the trend's window does not fit. A period that is not a whole number, below 2, or with fewer than two full periods is #NUM!; a multiplicative model over a value not above 0 is #NUM!; a model other than additive/multiplicative #VALUE!.
- A series is one row or one column, each cell read as TREND and LINEST read theirs (text that is a number counts); a blank, or text that is not a number, is #VALUE! (skipping would shift the points after it).
- Resampling to months or weeks is left to GROUPBY over EOMONTH (#150), as the issue says; the README shows it.
