// With the JSON editor open, a click on a table cell selects that cell's JSON in the editor.

import { findCellJsonPosition, normalizeData } from "../engine";

/** Select, in `textarea` holding `editableJson`, the JSON of the cell at `rowIndex`, `colIndex` of the
 *  sheet at `sheetIndex`, and scroll it into view; nothing when the cell is not in the JSON. */
export function selectCellInEditor(textarea: HTMLTextAreaElement, editableJson: string, sheetIndex: number, rowIndex: number, colIndex: number): void {
  try {
    const sheets = JSON.parse(editableJson);
    const currentSheet = sheets[sheetIndex];
    if (!currentSheet || !currentSheet.data) return;
    const normalizedData = normalizeData(currentSheet.data);
    if (!normalizedData[rowIndex] || normalizedData[rowIndex][colIndex] === undefined) {
      return;
    }
    const cellStr = JSON.stringify(normalizedData[rowIndex][colIndex]);
    const cellStart = findCellJsonPosition(editableJson, currentSheet.name, rowIndex, colIndex);
    if (cellStart < 0) return;
    textarea.focus();
    textarea.setSelectionRange(cellStart, cellStart + cellStr.length);
    // Scroll the textarea to make the selection visible.
    const textBeforeSelection = editableJson.substring(0, cellStart);
    const lineNumber = textBeforeSelection.split("\n").length;
    const lineHeight = 22;
    textarea.scrollTop = Math.max(0, lineNumber * lineHeight - textarea.clientHeight / 2);
  } catch (error) {
    console.error("Failed to select cell in editor:", error);
  }
}
