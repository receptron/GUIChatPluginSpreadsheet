# #148 part 3 — a workbook function may return a table

- The caller that runs a workbook function inside QuickJS writes its answer back as one JSON string, under the call's deadline: each cell tagged by type alone (an object is #VALUE! without a property of it being read), and an array as a table — its rows; an element that is not an array is a row of one cell, so a flat array is a column.
- The host (`decodedResult`) checks every part of that string with type guards: anything not shaped as the caller writes it is #VALUE! (a function can replace its own JSON.stringify). Ragged rows are filled with #N/A; a table larger than a sheet holds is #VALUE!; an empty array is #VALUE!.
- A workbook function is registered as one that may answer a table (`spills: true`), so its table spills and `SUM(MYFN(…))` reads it.
- One value is read as before: a non-finite number #NUM!, null or undefined or an object #VALUE!.
