// What a formula is evaluated against: reading cells and ranges, evaluating a nested formula, and
// where the formula is.

import type { CellCoordinates } from "./registry";
import type { CellValue, FormulaValue } from "./types";

/**
 * Evaluation context for formulas
 */
export interface EvaluatorContext {
  getCellValue: (ref: string) => CellValue;
  getRangeValues: (range: string) => CellValue[];
  getRangeValuesRaw?: ((range: string) => CellValue[]) | undefined;
  getRangeValuesKeepingBlanks?: ((range: string) => CellValue[]) | undefined;
  countFilledCells?: ((range: string) => number) | undefined;
  evaluateFormula: (formula: string) => CellValue;
  /** A formula's value, a table included; see FunctionContext. */
  evaluateValue?: ((formula: string) => FormulaValue) | undefined;
  getRangeGrid?: ((range: string) => CellValue[][]) | undefined;
  /** Reading order for an ambiguous slash date; see engine/date-locale.ts. */
  preferDDMMYYYY?: boolean | undefined;
  /** Whether the referenced cell holds nothing. `getCellValue` reads such a cell as 0, which
   *  is right for arithmetic and wrong for `&`, where a blank cell joins as "". */
  isCellEmpty?: ((ref: string) => boolean) | undefined;
  currentCell?: CellCoordinates | undefined;
  currentSheet?: string | undefined;
}
