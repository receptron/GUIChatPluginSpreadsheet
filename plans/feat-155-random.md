# #155 — RAND, RANDBETWEEN, RANDARRAY

## Decision: the numbers hold still
The agent and the page each calculate the workbook, so a volatile RAND would show different numbers to each. Each call draws instead from a stream seeded by the sheet, the cell and how many random calls that formula has made before it, in evaluation order (FNV-1a over UTF-8 → Mulberry32); a call outside a cell is always the first. The same workbook calculates to the same numbers every time.

Not decided here: a seed the workbook could carry (a field on the sheet) to draw a new set. That changes the saved format and the tool schema, so it is left for the user to decide.

## Rules (Excel's, where Microsoft documents them)
- RANDBETWEEN: both bounds included; bottom rounded up, top down; no whole number between them is #NUM!.
- RANDARRAY: rows and columns default to 1, min 0, max 1, whole_number FALSE; min not below max is #VALUE! (documented: min must be less than max). Sizes are truncated as SEQUENCE's are: 0 is #CALC!, below 0 #VALUE!; whole numbers between bounds that are not whole is #VALUE!.
- Bootstrap and other resampling are left to workbook functions (QuickJS), as the issue suggests.
