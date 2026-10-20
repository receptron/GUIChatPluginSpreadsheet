# fix: a formula's "" and text read the same whichever cell is calculated first (#162)

## Defect
A formula answering `""` read as `""` from a formula calculated before it and as `0` after it; one
answering `"1,200"` read as text before and as 1200 after. `getRawValue` re-read an already calculated
answer by the rules for a value typed into a cell.

## Rule
- A formula cell already calculated reads as exactly what it answered.
- A formula cell is never empty (`isCellEmpty`), whatever it answers, as in Excel. It is told by the
  sheet as written, which no calculation changes, so it no longer has to be calculated to be judged
  (the answer-based judgement was introduced to make `=" "` order-independent; this does that too).

## Effects (Excel's answers)
With A1 `=""`: `=A1<1` FALSE, `=A1=0` FALSE, `=A1=""` TRUE, `=A1+1` #VALUE!, `=A1&"x"` "x", COUNTA 1.
With B1 `=" "`: `=B1&"x"` " x". With C1 `="1,200"`: `=C1` "1,200", `=C1*2` 2400.

## Verification
- `tests/engine/test_formulaEmptyText.ts`: each reader with the sources above and below it.
- The differential run over the test corpus's formulas against main: no difference.
- Reverting either half turns the suite red.
