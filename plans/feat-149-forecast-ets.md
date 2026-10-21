# #149 — FORECAST.ETS, FORECAST.ETS.CONFINT, FORECAST.ETS.SEASONALITY

Excel does not publish how it fits its model, so the values cannot be matched to Excel's; the user chose additive Holt-Winters, written down here so the numbers have a stated source.

## How
- `forecast-ets-math.ts` (pure):
  - **The regular series.** Pairs with the same time are combined by the aggregation. The step is the smallest gap, and every gap must be a whole number of steps. A blank value keeps its time as a missing point. Missing points are filled, by straight-line interpolation (1, the nearest value at an end) or with zeros (0); more than 30% of the points missing is #NUM!.
  - **Seasonality detection.** The autocorrelation of the series with its least-squares line removed is computed at each lag from 2 to half the length, all lags from one FFT (`fft-math.ts`). The answer is the highest local peak above 1.96/√n, and 0 when there is none.
  - **The fit.** Additive Holt-Winters in statsmodels' form (`ExponentialSmoothing(trend="add", seasonal="add")`, γ ≤ 1 − α).
    - Initial state:
      - with a season: the first season's mean as the level, the change between the first two seasons' means as the trend, and the first season's deviations as the season;
      - without one: the second value as the level and the first difference as the trend.
    - α, β and γ minimise the squared one-step errors, found by a pattern search from each of the best points of a coarse grid.
  - **The forecast** h steps past the last point: level + h·trend + that phase's latest season. A fractional h is interpolated between the whole steps on either side.
  - **The interval**: z·σ·√(1 + Σⱼ₌₁ᵏ⁻¹ cⱼ²), with cⱼ = α + αβj + γ·[m divides j] (Hyndman et al., ETS(A,A,A)), k = ⌈h⌉ (at least 1), and σ² the mean squared one-step error.
- `forecast-ets.ts` reads the arguments (a blank value as null), and keeps a small cache of fits so that a column of forecasts over one series fits it once.

## Decisions
- **Duplicate times** are combined by the aggregation (0 or 1 AVERAGE, 2 COUNT, 3 COUNTA, 4 MAX, 5 MEDIAN, 6 MIN, 7 SUM). Excel's page also says duplicates are #VALUE!, but then the aggregation argument would have nothing to do.
- **A blank value** is a missing point at its time. Text that is not a number is #VALUE!, as is a blank time.
- **Errors:**
  - Seasonality: anything other than a whole number from 0 to 8760 is #NUM!.
  - With a season, fewer than two full seasons of values is #NUM!; without one, fewer than three points is #NUM!.
  - A target before the last time is #NUM!.
  - Different sizes of values and timeline are #N/A.
- **FORECAST.ETS.SEASONALITY** answers 0 when it finds no season, which FORECAST.ETS reads as "no season".
- **FORECAST.ETS.STAT** is not included.
