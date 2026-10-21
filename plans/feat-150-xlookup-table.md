# #150 part 4 — XLOOKUP that answers a row or column

- A return range of several rows and several columns answers the whole matching row (lookup down a column) or the whole matching column (lookup along a row), and spills. A one-cell lookup range counts as a column. Past the return range's end is #N/A.
- A return range of one row or one column answers one cell exactly as before (checked old against new over generated lookups, and over the test corpus).
- XLOOKUP is registered as one that may answer a table (`spills: true`).
