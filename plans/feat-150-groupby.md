# #150 part 3 — GROUPBY and PIVOTBY

- The function argument is a function's name (Excel's eta-reduced LAMBDA: SUM, AVERAGE, …) or a LAMBDA of one parameter; each group's values reach it as a held column (`aggregatorFor` in let-lambda.ts, the held values of #157).
- Keys group as UNIQUE compares them (text without regard to case); groups sort by each key column ascending unless sort_order says otherwise (columns of the answer, negative descending).
- GROUPBY: a row per group, then a `Total` row; with two key columns or more, a subtotal per first key by default (total_depth 2). field_headers 0–3 and auto-detection as Microsoft documents; mode 2's made-up headers are `Row Field n` and `Value n`.
- PIVOTBY: one values column; column keys across (a header row per column field), row keys down, blank where no row has both keys, `Total` row and column; negative depths put them first.
- Not supported (#VALUE!): field_relationship, relative_to, several PIVOTBY values columns, PIVOTBY subtotals.
