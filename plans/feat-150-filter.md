# #150 part 2 — FILTER

Stacked on #172: the include argument is an expression over arrays (`B2:B9>5`, `(A=…)*(B>…)`).

- `FILTER(array, include, [if_empty])` keeps the rows whose include value is TRUE or a number other than 0, when include is one column as tall as the array; the columns, when it is one row as wide. Any other shape, or text in include, is #VALUE!; an error in include is that error.
- Nothing kept: if_empty (read only then), or #CALC! without one.
- The array is read as the other table functions read it (`tableArg`: a blank cell as 0).

Left for later: GROUPBY and PIVOTBY (they take a function, after #157), and an XLOOKUP that answers a table.
