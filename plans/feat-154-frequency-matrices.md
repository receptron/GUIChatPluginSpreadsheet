# feat: FREQUENCY, MMULT, MINVERSE, MDETERM and MUNIT (#154)

Built on #168 (and through it #163). The table-argument readers move from array-functions.ts to a shared
table-args.ts, unchanged.

## Decisions
- A matrix argument is read with blanks kept: a blank, text or a logical value is #VALUE!, an error cell
  that error (Excel's MMULT/MINVERSE/MDETERM rules).
- MINVERSE and MDETERM share one LU decomposition with scaled partial pivoting, as LibreOffice's; a
  matrix is singular when a pivot is exactly 0: MINVERSE #NUM! (Microsoft), MDETERM 0.
- FREQUENCY reads the numbers of its ranges (text and blanks left out), counts a value on a bin into that
  bin, reports the bins in their own order (sorted only to count, as LibreOffice), and adds the count
  above every bin; no bins gives the count of the values, no values zeros (Microsoft).

## Verification
- tests/engine/test_matrixFunctions.ts: Microsoft's examples, the rules, an ill-conditioned inverse that
  needs the largest pivot, and generated properties (A·A⁻¹ = I, det(AB) = det A · det B, FREQUENCY's
  counts add up).
- The corpus differential against #168's head: no existing formula changed.
- A mutation sweep over the decisions against the whole suite.
