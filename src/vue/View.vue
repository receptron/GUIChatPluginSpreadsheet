<template>
  <div class="spreadsheet-container">
    <div v-if="loading" class="min-h-full p-8 flex items-center justify-center">
      <div class="text-gray-500">{{ t.loading }}</div>
    </div>
    <div v-else-if="errorMessage" class="min-h-full p-8 flex items-center justify-center">
      <div class="error">{{ errorMessage }}</div>
    </div>
    <div v-else-if="!resolvedSheets || resolvedSheets.length === 0" class="min-h-full p-8 flex items-center justify-center">
      <div class="text-gray-500">{{ t.noData }}</div>
    </div>
    <template v-else>
      <div class="spreadsheet-content-wrapper">
        <div class="p-4">
          <div class="header">
            <h1 class="title">
              {{ selectedResult.title || t.untitled }}
            </h1>
            <button
              class="download-btn h-8 px-2.5 flex items-center gap-1 rounded bg-[#217346] hover:bg-[#1e6a3f] active:bg-[#1a5c36] text-white text-sm transition-colors"
              @click="downloadExcel"
            >
              <span class="material-icons text-base">download</span>
              {{ t.excel }}
            </button>
          </div>

          <!-- Sheet tabs (if multiple sheets) -->
          <div v-if="resolvedSheets.length > 1" class="sheet-tabs">
            <button
              v-for="(sheet, index) in resolvedSheets"
              :key="index"
              :class="['sheet-tab', { active: activeSheetIndex === index }]"
              @click="activeSheetIndex = index"
            >
              {{ sheet.name }}
            </button>
          </div>

          <!-- Spreadsheet table -->
          <div ref="tableContainer" class="table-container" @click="handleTableClick" v-html="renderedHtml"></div>
        </div>
      </div>

      <!-- Collapsible Editor -->
      <details v-if="!miniEditorOpen" ref="editorDetails" class="spreadsheet-source">
        <summary>{{ t.editData }}</summary>
        <textarea ref="editorTextarea" v-model="editableData" class="spreadsheet-editor" spellcheck="false" @input="handleDataEdit"></textarea>
        <button class="apply-btn" :disabled="!hasChanges" @click="applyChanges">{{ t.applyChanges }}</button>
      </details>

      <!-- Mini Editor at Bottom -->
      <div v-if="miniEditorOpen" class="mini-editor-panel">
        <div class="mini-editor-content">
          <span v-if="miniEditorCell" class="cell-ref"> {{ indexToCol(miniEditorCell.col) }}{{ miniEditorCell.row + 1 }} </span>

          <!-- Type Selector -->
          <div class="radio-group">
            <label class="radio-option">
              <input v-model="miniEditorType" type="radio" value="string" />
              {{ t.stringType }}
            </label>
            <label class="radio-option">
              <input v-model="miniEditorType" type="radio" value="object" />
              {{ t.formulaType }}
            </label>
          </div>

          <!-- String input -->
          <input
            v-if="miniEditorType === 'string'"
            v-model="miniEditorValue"
            type="text"
            class="form-input"
            :placeholder="t.valuePlaceholder"
            @keyup.enter="saveMiniEditor"
          />

          <!-- Formula inputs -->
          <template v-if="miniEditorType === 'object'">
            <input v-model="miniEditorFormula" type="text" class="form-input" :placeholder="t.valueOrFormulaPlaceholder" @keyup.enter="saveMiniEditor" />
            <input v-model="miniEditorFormat" type="text" class="form-input" :placeholder="t.formatPlaceholder" @keyup.enter="saveMiniEditor" />
          </template>

          <button class="save-btn" @click="saveMiniEditor">{{ t.update }}</button>
          <button class="cancel-btn" @click="closeMiniEditor">✕</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch, onMounted, onUnmounted } from "vue";
import * as XLSX from "xlsx";
import { PLUGIN_RUNTIME_KEY, type ToolResult } from "gui-chat-protocol/vue";
import type { SpreadsheetToolData, SpreadsheetSheet, StorableCell, SpreadsheetCell } from "../core/types";
import { isSpreadsheetArtifactPath } from "../core/paths";
import { readSheets } from "../core/sheetGuards";
import {
  SpreadsheetEngine,
  prefersDayFirst,
  indexToColumn,
  extractCellReferences,
  buildCellFromInput,
  normalizeData,
  findCellJsonPosition,
  type SheetData,
  type CellValue,
} from "../engine";
import { errorMessage as formatErrorMessage, isObj, isRecord } from "../engine/guards";
import { applyCellHighlights, clearCellHighlights } from "./cellHighlights";
import { getArrowKeyOffset, isWithinSheetBounds } from "./keyboardNav";
import { escapeHtml, isCrossOriginHttpUrl } from "./htmlText";
import { useT } from "../lang";
import { createSheetSession, type LoadOutcome } from "./sheetSession";

// Import all spreadsheet functions to populate the function registry
import "../engine/functions";

const t = useT();

// Absent outside a host that provides the gui-chat-protocol runtime (a
// standalone demo, MulmoChat): only inline workbooks render there.
const runtime = inject(PLUGIN_RUNTIME_KEY, undefined);
const locale = computed(() => runtime?.locale.value ?? "en");

/**
 * Normalize malformed data structures
 * Some models generate flat arrays instead of 2D arrays - fix them
 */
function normalizeSheetData(data: unknown): unknown[][] {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  // If data is already a 2D array, return as-is
  if (Array.isArray(data[0])) {
    return data;
  }

  // If data is a flat array of cell objects, convert to 2D by pairing cells
  // Pattern: [cell1, cell2, cell3, cell4] -> [[cell1, cell2], [cell3, cell4]]
  if (isObj(data[0])) {
    const rows: unknown[][] = [];
    for (let i = 0; i < data.length; i += 2) {
      const row = [data[i]];
      if (i + 1 < data.length) {
        row.push(data[i + 1]);
      }
      rows.push(row);
    }
    return rows;
  }

  // Unknown structure - return empty
  return [];
}

const props = defineProps<{
  selectedResult: ToolResult<SpreadsheetToolData>;
}>();

const emit = defineEmits<{
  updateResult: [result: ToolResult];
}>();

// Create spreadsheet engine instance
const engine = new SpreadsheetEngine();

const loading = ref(false);
const errorMessage = ref("");
const resolvedSheets = ref<SpreadsheetSheet[]>([]);

// Declared before fetchSheets, which writes it once a load lands.
const editableData = ref(JSON.stringify(resolvedSheets.value || [], null, 2));

const readDispatchedSheets = (raw: unknown): SpreadsheetSheet[] => {
  const sheets = isRecord(raw) && isRecord(raw["data"]) ? readSheets(raw["data"]["sheets"]) : null;
  if (!sheets) throw new Error(t.value.dataMustBeArray);
  return sheets;
};

const session = createSheetSession(
  runtime
    ? {
        loadFromHost: (path) => runtime.dispatch({ kind: "loadSpreadsheet", path }, readDispatchedSheets),
        saveToHost: (path, sheets) => runtime.dispatch({ kind: "saveSpreadsheet", path, sheets }),
      }
    : null,
);

function loadErrorText(outcome: LoadOutcome): string {
  if (outcome.kind === "notSheets") return t.value.dataMustBeArray;
  if (outcome.kind === "noHost") return t.value.loadFailed(outcome.path);
  if (outcome.kind === "loadFailed") return t.value.loadFailed(formatErrorMessage(outcome.error, t.value.unknownError));
  return "";
}

/** Load the selected result's workbook. A load overtaken by a newer one
 *  (the result changed while it was in flight) leaves the state alone. */
async function fetchSheets(resetActiveSheet: boolean): Promise<void> {
  // Clear any stale error from a previous result first, otherwise switching
  // from a failed file-backed load to an inline result leaves the error up.
  errorMessage.value = "";
  loading.value = isSpreadsheetArtifactPath(props.selectedResult.data?.sheets);
  const outcome = await session.load(props.selectedResult.data?.sheets);
  if (!outcome) return;
  loading.value = false;
  resolvedSheets.value = outcome.kind === "sheets" ? outcome.sheets : [];
  errorMessage.value = loadErrorText(outcome);
  editableData.value = JSON.stringify(resolvedSheets.value, null, 2);
  if (resetActiveSheet) activeSheetIndex.value = 0;
}

/** Persist edited sheets to disk when file-backed, and emit updateResult. */
async function persistSheets(sheets: SpreadsheetSheet[]): Promise<void> {
  const raw = props.selectedResult.data?.sheets;
  const filePath = isSpreadsheetArtifactPath(raw) ? raw : null;
  if (filePath) {
    try {
      await session.save(filePath, sheets);
    } catch (error) {
      errorMessage.value = t.value.saveFailed(formatErrorMessage(error, t.value.unknownError));
      return;
    }
    // The file is saved either way; only the result still on screen may take the edit.
    if (props.selectedResult.data?.sheets !== raw) return;
  }

  resolvedSheets.value = sheets;

  const updatedResult: ToolResult<SpreadsheetToolData> = {
    ...props.selectedResult,
    data: {
      ...props.selectedResult.data,
      sheets: filePath ?? sheets,
    },
  };
  emit("updateResult", updatedResult);
}

const activeSheetIndex = ref(0);

void fetchSheets(false);

const editorTextarea = ref<HTMLTextAreaElement | null>(null);
const editorDetails = ref<HTMLDetailsElement | null>(null);
const tableContainer = ref<HTMLDivElement | null>(null);

// Mini editor state
const miniEditorOpen = ref(false);
const miniEditorCell = ref<{ row: number; col: number } | null>(null);

const miniEditorValue = ref<unknown>(null);
const miniEditorType = ref<"number" | "string" | "object">("string");
const miniEditorFormula = ref("");
const miniEditorFormat = ref("");

// Referenced cells state (for formula highlighting)
const referencedCells = ref<{ row: number; col: number }[]>([]);

// Check if spreadsheet data has been modified
const hasChanges = computed(() => {
  try {
    const currentData = JSON.stringify(resolvedSheets.value || [], null, 2);
    return editableData.value !== currentData;
  } catch {
    return false;
  }
});

// Short alias used in the template column header.
const indexToCol = indexToColumn;

// `normalizeData` is the engine's own reader for the stored cell forms (bare
// values, `null` gaps, flat rows); `calculate` runs it internally anyway, so
// applying it here only meets the engine's declared type at the call site.
const toEngineSheet = (sheet: SpreadsheetSheet): SheetData => ({ name: sheet.name, data: normalizeData(sheet.data) });

// Calculate formulas in the data using the spreadsheet engine
const calculateFormulas = (data: StorableCell[][], sheetName?: string): CellValue[][] => {
  // If we have a sheet name, we need to find all sheets for cross-sheet references
  const allSheets = resolvedSheets.value.map(toEngineSheet);

  // Create a SheetData object for the engine
  const sheet: SheetData = {
    name: sheetName || "Sheet1",
    data: normalizeData(data),
  };

  // Read the date order from the current locale on every calculation, so a
  // locale switch takes effect without rebuilding the engine.
  engine.setOptions({ preferDDMMYYYY: prefersDayFirst(locale.value) });
  const result = engine.calculate(sheet, allSheets);

  return result.data;
};

// Render the active sheet as HTML table
const renderedHtml = computed(() => {
  if (!resolvedSheets.value || resolvedSheets.value.length === 0) {
    return "";
  }

  const sheet = resolvedSheets.value[activeSheetIndex.value];
  if (!sheet || !sheet.data) {
    return "";
  }

  try {
    // Calculate formulas first with sheet name for cross-sheet references
    const calculatedData = calculateFormulas(sheet.data, sheet.name);

    // Convert data array to worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(calculatedData);

    // Generate HTML table
    const html = XLSX.utils.sheet_to_html(worksheet, {
      id: "spreadsheet-table",
      editable: false,
    });

    return html;
  } catch (error) {
    console.error("Failed to render spreadsheet:", error);
    // Fed into v-html, and a caught throw can carry an object whose
    // `details` / `message` formatErrorMessage surfaces verbatim.
    return `<div class="error">Failed to render spreadsheet: ${escapeHtml(formatErrorMessage(error, "Unknown error"))}</div>`;
  }
});

// Download as Excel file
const downloadExcel = () => {
  if (!resolvedSheets.value || resolvedSheets.value.length === 0) return;

  try {
    const workbook = XLSX.utils.book_new();

    // Add all sheets to workbook
    resolvedSheets.value.forEach((sheet) => {
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });

    // Generate filename
    const filename = props.selectedResult.title ? `${props.selectedResult.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.xlsx` : "spreadsheet.xlsx";

    // Write file
    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error("Failed to download Excel:", error);
    alert(`Failed to download Excel file: ${formatErrorMessage(error, "Unknown error")}`);
  }
};

function handleDataEdit() {
  // Just update the local state, don't apply yet
  // User needs to click "Apply Changes" button
}

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
const plainCellText = (value: unknown): string => (typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "");

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

// External http(s) links inside cells (XLSX hyperlink fields) open in a new
// tab instead of navigating the host app away.
function handleExternalLinkClick(event: MouseEvent): boolean {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const anchor = event.target instanceof Element ? event.target.closest("a") : null;
  if (!anchor || !isCrossOriginHttpUrl(anchor.href, window.location.origin)) return false;
  event.preventDefault();
  if (runtime) runtime.openUrl(anchor.href);
  else window.open(anchor.href, "_blank", "noopener,noreferrer");
  return true;
}

function handleTableClick(event: MouseEvent) {
  if (handleExternalLinkClick(event)) return;
  const cell = event.target;
  // HTMLTableCellElement covers <th> too, and only data cells carry coordinates.
  if (!(cell instanceof HTMLTableCellElement) || cell.tagName !== "TD") return;
  const row = cell.parentElement;
  if (!(row instanceof HTMLTableRowElement)) return;

  const colIndex = cell.cellIndex;
  const { rowIndex } = row;

  // Check if the main editor details is open
  const isEditorOpen = editorDetails.value?.open ?? false;

  // If editor is closed, open mini editor
  if (!isEditorOpen) {
    openMiniEditor(rowIndex, colIndex);
    return;
  }

  // If editor is open, try to find and select this cell in the editor.
  if (!editorTextarea.value) return;
  try {
    const sheets = JSON.parse(editableData.value);
    const currentSheet = sheets[activeSheetIndex.value];
    if (!currentSheet || !currentSheet.data) return;
    const normalizedData = normalizeSheetData(currentSheet.data);
    if (!normalizedData[rowIndex] || normalizedData[rowIndex][colIndex] === undefined) {
      return;
    }
    const cellStr = JSON.stringify(normalizedData[rowIndex][colIndex]);
    const cellStart = findCellJsonPosition(editableData.value, currentSheet.name, rowIndex, colIndex);
    if (cellStart < 0) return;
    editorTextarea.value.focus();
    editorTextarea.value.setSelectionRange(cellStart, cellStart + cellStr.length);
    // Scroll the textarea to make the selection visible.
    const textBeforeSelection = editableData.value.substring(0, cellStart);
    const lineNumber = textBeforeSelection.split("\n").length;
    const lineHeight = 22;
    const textarea = editorTextarea.value;
    textarea.scrollTop = Math.max(0, lineNumber * lineHeight - textarea.clientHeight / 2);
  } catch (error) {
    console.error("Failed to select cell in editor:", error);
  }
}

async function applyChanges() {
  try {
    // Parse the edited JSON
    const parsedSheets = JSON.parse(editableData.value);

    // Validate it's an array
    if (!Array.isArray(parsedSheets)) {
      throw new Error(t.value.dataMustBeArray);
    }

    // Persist to disk (if file-backed) and emit update
    await persistSheets(parsedSheets);

    // Reset to first sheet after update
    activeSheetIndex.value = 0;
  } catch (error) {
    alert(t.value.invalidJsonAlert(formatErrorMessage(error, t.value.unknownError)));
  }
}

// Watch for external changes to selectedResult
watch(
  () => props.selectedResult.data?.sheets,
  () => {
    void fetchSheets(true);
  },
);

// Reset active sheet if it's out of bounds
watch(
  () => resolvedSheets.value?.length,
  (length) => {
    if (length && activeSheetIndex.value >= length) {
      activeSheetIndex.value = 0;
    }
  },
);

// Highlight selected cell and referenced cells when mini editor is
// open. The per-step DOM work lives in cellHighlights.ts so this
// callback stays trivial and the complexity lands on the helpers,
// each of which is linear.
watch(
  [miniEditorOpen, miniEditorCell, referencedCells, renderedHtml],
  () => {
    clearCellHighlights(tableContainer.value);
    if (!miniEditorOpen.value) return;
    applyCellHighlights(tableContainer.value, miniEditorCell.value, referencedCells.value);
  },
  { flush: "post" },
);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
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

// Add keyboard event listener on mount
onMounted(() => {
  document.addEventListener("keydown", handleKeyboardNavigation);
});

// Remove keyboard event listener on unmount
onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyboardNavigation);
});
</script>

<style scoped>
.spreadsheet-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
}

.spreadsheet-content-wrapper {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1em;
}

.title {
  font-size: 2em;
  margin: 0;
  font-weight: bold;
}

/* Sheet tabs */
.sheet-tabs {
  display: flex;
  gap: 0.25em;
  margin-bottom: 1em;
  border-bottom: 2px solid #e0e0e0;
}

.sheet-tab {
  padding: 0.5em 1em;
  background: #f5f5f5;
  border: none;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  color: #666;
  transition: background-color 0.2s;
}

.sheet-tab:hover {
  background: #e8e8e8;
}

.sheet-tab.active {
  background: white;
  color: #333;
  font-weight: 500;
  border-bottom: 2px solid white;
  margin-bottom: -2px;
}

/* Table container */
.table-container {
  overflow-x: auto;
  background: white;
}

/* Style the generated table */
.table-container :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-family: "Segoe UI", Arial, sans-serif;
  font-size: 0.9em;
}

.table-container :deep(td),
.table-container :deep(th) {
  border: 1px solid #d0d0d0;
  padding: 0.5em 0.75em;
  text-align: left;
}

.table-container :deep(th) {
  background-color: #f5f5f5;
  font-weight: 600;
  color: #333;
}

.table-container :deep(tr:nth-child(even)) {
  background-color: #fafafa;
}

.table-container :deep(tr:hover) {
  background-color: #f0f0f0;
}

.table-container :deep(.cell-editing) {
  background-color: #e8f5e9 !important;
  outline: 2px solid #217346 !important;
  outline-offset: -2px;
}

.table-container :deep(.cell-referenced) {
  background-color: #fff3e0 !important;
  outline: 2px solid #ff9800 !important;
  outline-offset: -2px;
}

/* Error message */
.error {
  padding: 1em;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
  margin: 1em 0;
}

/* Editor section */
.spreadsheet-source {
  padding: 0.5rem;
  background: #f5f5f5;
  border-top: 1px solid #e0e0e0;
  font-family: Consolas, "MS Gothic", "BIZ UDGothic", monospace;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.spreadsheet-source summary {
  cursor: pointer;
  user-select: none;
  padding: 0.5rem;
  background: #e8e8e8;
  border-radius: 4px;
  font-weight: 500;
  color: #333;
}

.spreadsheet-source[open] summary {
  margin-bottom: 0.5rem;
}

.spreadsheet-source summary:hover {
  background: #d8d8d8;
}

.spreadsheet-editor {
  width: 100%;
  height: 40vh;
  padding: 1rem;
  background: #ffffff;
  border: 1px solid #ccc;
  border-radius: 4px;
  color: #333;
  font-family: "Courier New", "MS Gothic", "BIZ UDGothic", monospace;
  font-size: 0.9rem;
  resize: vertical;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

.spreadsheet-editor:focus {
  outline: none;
  border-color: #217346;
  box-shadow: 0 0 0 2px rgba(33, 115, 70, 0.1);
}

.apply-btn {
  padding: 0.5rem 1rem;
  background: #217346;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.2s;
  font-weight: 500;
}

.apply-btn:hover {
  background: #1e6a3f;
}

.apply-btn:active {
  background: #1a5c36;
}

.apply-btn:disabled {
  background: #cccccc;
  color: #666666;
  cursor: not-allowed;
  opacity: 0.6;
}

.apply-btn:disabled:hover {
  background: #cccccc;
}

/* Mini Editor Panel */
.mini-editor-panel {
  background: #f8f8f8;
  border-top: 1px solid #d0d0d0;
  flex-shrink: 0;
}

.mini-editor-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
}

.cell-ref {
  font-family: Consolas, "MS Gothic", "BIZ UDGothic", monospace;
  font-weight: 600;
  color: #217346;
  font-size: 0.85rem;
  min-width: 2rem;
}

.radio-group {
  display: flex;
  gap: 0.75rem;
  border-right: 1px solid #d0d0d0;
  padding-right: 0.75rem;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: #555;
}

.radio-option input[type="radio"] {
  cursor: pointer;
  width: 0.9rem;
  height: 0.9rem;
}

.form-input {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 0.85rem;
  font-family: inherit;
  transition: border-color 0.2s;
  min-width: 120px;
}

.form-input:focus {
  outline: none;
  border-color: #217346;
  box-shadow: 0 0 0 2px rgba(33, 115, 70, 0.1);
}

.form-input::placeholder {
  color: #999;
  font-size: 0.8rem;
}

.save-btn,
.cancel-btn {
  padding: 0.4rem 0.8rem;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: background 0.2s;
}

.save-btn {
  background: #217346;
  color: white;
}

.save-btn:hover {
  background: #1e6a3f;
}

.cancel-btn {
  background: transparent;
  color: #666;
  padding: 0.4rem;
  font-size: 1.2rem;
  line-height: 1;
}

.cancel-btn:hover {
  color: #333;
  background: #e0e0e0;
}
</style>
