// The mini editor below the table: the cell it edits, what it shows for that cell, the cells a formula
// there refers to, and writing the edited cell back into the sheets.

import { ref, type Ref } from "vue";
import type { SpreadsheetSheet, SpreadsheetCell } from "../core/types";
import { extractCellReferences, buildCellFromInput } from "../engine";
import { errorMessage as formatErrorMessage, isRecord } from "../engine/guards";
import { normalizeSheetData } from "./sheetRows";
import { getArrowKeyOffset, isWithinSheetBounds } from "./keyboardNav";

/** What the mini editor works on: the editor's JSON, the sheet shown, and how a change is saved. */
export interface MiniEditorSources {
  editableData: Ref<string>;
  activeSheetIndex: Ref<number>;
  persistSheets: (sheets: SpreadsheetSheet[]) => Promise<void>;
}

const plainCellText = (value: unknown): string => (typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "");

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function useMiniEditor({ editableData, activeSheetIndex, persistSheets }: MiniEditorSources) {
  // Mini editor state
  const miniEditorOpen = ref(false);
  const miniEditorCell = ref<{ row: number; col: number } | null>(null);

  const miniEditorValue = ref<unknown>(null);
  const miniEditorType = ref<"number" | "string" | "object">("string");
  const miniEditorFormula = ref("");
  const miniEditorFormat = ref("");

  // Referenced cells state (for formula highlighting)
  const referencedCells = ref<{ row: number; col: number }[]>([]);

  function openMiniEditor(rowIndex: number, colIndex: number) {
    try {
      const sheets = JSON.parse(editableData.value);
      const currentSheet = sheets[activeSheetIndex.value];

      if (!currentSheet || !currentSheet.data) {
        return;
      }

      // Normalize the data in case it's malformed
      const normalizedData = normalizeSheetData(currentSheet.data);

      if (!normalizedData[rowIndex] || normalizedData[rowIndex][colIndex] === undefined) {
        return;
      }

      const cellValue = normalizedData[rowIndex][colIndex];

      // Determine cell type and extract values (new format: {v, f})
      if (isRecord(cellValue) && "v" in cellValue) {
        const value = cellValue["v"];
        const format = typeof cellValue["f"] === "string" ? cellValue["f"] : "";

        // Check if it's a formula (value starts with "=")
        if (typeof value === "string" && value.startsWith("=")) {
          miniEditorType.value = "object";
          miniEditorValue.value = "";
          miniEditorFormula.value = value.substring(1); // Remove "=" prefix
          miniEditorFormat.value = format;
          // Extract and store referenced cells for highlighting
          referencedCells.value = extractCellReferences(value);
        } else if (typeof value === "number") {
          miniEditorType.value = "object";
          miniEditorValue.value = "";
          miniEditorFormula.value = String(value);
          miniEditorFormat.value = format;
          referencedCells.value = [];
        } else {
          miniEditorType.value = "string";
          miniEditorValue.value = String(value);
          miniEditorFormula.value = "";
          miniEditorFormat.value = "";
          referencedCells.value = [];
        }
      } else {
        // Legacy format or plain value
        miniEditorType.value = "string";
        miniEditorValue.value = plainCellText(cellValue);
        miniEditorFormula.value = "";
        miniEditorFormat.value = "";
        referencedCells.value = [];
      }

      miniEditorCell.value = { row: rowIndex, col: colIndex };
      miniEditorOpen.value = true;
    } catch (error) {
      console.error("Failed to open mini editor:", error);
    }
  }

  // A bare value as the editor shows it. An object without `v` (`{}`, `{ f }`)
  // holds no value, so it reads as empty rather than "[object Object]".

  function closeMiniEditor() {
    miniEditorOpen.value = false;
    miniEditorCell.value = null;
    miniEditorValue.value = null;
    miniEditorFormula.value = "";
    miniEditorFormat.value = "";
    referencedCells.value = [];
  }

  function saveMiniEditor() {
    if (!miniEditorCell.value) return;

    try {
      const sheets = JSON.parse(editableData.value);
      const currentSheet = sheets[activeSheetIndex.value];

      if (!currentSheet || !currentSheet.data) return;

      const { row, col } = miniEditorCell.value;

      // Normalize the data in case it's malformed
      const normalizedData = normalizeSheetData(currentSheet.data);

      // Ensure the row exists
      while (normalizedData.length <= row) {
        normalizedData.push([]);
      }

      // Ensure the row is an array
      if (!Array.isArray(normalizedData[row])) {
        normalizedData[row] = [];
      }

      // Build the new cell value (delegates formula/number detection
      // and format attachment to the pure helper).
      const newCellValue: SpreadsheetCell = buildCellFromInput({
        type: miniEditorType.value,
        value: miniEditorValue.value,
        formula: miniEditorFormula.value,
        format: miniEditorFormat.value,
      });

      // Update the cell in normalized data
      normalizedData[row][col] = newCellValue;

      // Update the sheet with normalized data
      currentSheet.data = normalizedData;

      // Update editableData
      editableData.value = JSON.stringify(sheets, null, 2);

      // Persist to disk (if file-backed) and emit update
      void persistSheets(sheets);

      // Update referenced cells if the saved cell contains a formula
      if (typeof newCellValue.v === "string" && newCellValue.v.startsWith("=")) {
        referencedCells.value = extractCellReferences(newCellValue.v);
      } else {
        referencedCells.value = [];
      }

      // Don't close the mini editor - keep it open so user can see the updated references
    } catch (error) {
      alert(`Failed to save cell: ${formatErrorMessage(error, "Unknown error")}`);
    }
  }

  function handleKeyboardNavigation(event: KeyboardEvent) {
    if (!miniEditorOpen.value || !miniEditorCell.value) return;
    if (isEditableTarget(event.target)) return;

    const { row, col } = miniEditorCell.value;
    const next = getArrowKeyOffset(event.key, row, col);
    if (!next) return;

    try {
      const sheets = JSON.parse(editableData.value);
      if (!isWithinSheetBounds(sheets[activeSheetIndex.value], next.row, next.col)) return;
      event.preventDefault();
      openMiniEditor(next.row, next.col);
    } catch (error) {
      console.error("Failed to navigate cells:", error);
    }
  }

  return {
    miniEditorOpen,
    miniEditorCell,
    miniEditorValue,
    miniEditorType,
    miniEditorFormula,
    miniEditorFormat,
    referencedCells,
    openMiniEditor,
    closeMiniEditor,
    saveMiniEditor,
    handleKeyboardNavigation,
  };
}
