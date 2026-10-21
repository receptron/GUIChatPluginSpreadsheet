<template>
  <div class="w-full h-full flex flex-col bg-white">
    <div v-if="loading" class="min-h-full p-8 flex items-center justify-center">
      <div class="text-gray-500">{{ t.loading }}</div>
    </div>
    <div v-else-if="errorMessage" class="min-h-full p-8 flex items-center justify-center">
      <div class="p-[1em] my-[1em] rounded bg-[#ffebee] text-[#c62828]">{{ errorMessage }}</div>
    </div>
    <div v-else-if="!resolvedSheets || resolvedSheets.length === 0" class="min-h-full p-8 flex items-center justify-center">
      <div class="text-gray-500">{{ t.noData }}</div>
    </div>
    <template v-else>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="p-4">
          <div class="flex items-center justify-between mb-[1em]">
            <h1 class="m-0 text-[2em] font-bold">
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

          <div v-if="fileChangedNotice" class="mb-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{{ fileChangedNotice }}</div>
          <div v-if="saveConflict" class="mb-2 flex flex-wrap items-center gap-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span class="min-w-0 flex-1">{{ t.saveConflict }}</span>
            <button class="rounded border border-amber-300 bg-white px-2 py-1 hover:bg-amber-100" @click="useFileVersion">{{ t.useFileVersion }}</button>
            <button class="rounded bg-amber-700 px-2 py-1 text-white hover:bg-amber-800" @click="overwriteWithMine">{{ t.overwriteWithMine }}</button>
          </div>

          <!-- Sheet tabs (if multiple sheets) -->
          <div v-if="resolvedSheets.length > 1" class="flex gap-[0.25em] mb-[1em] border-b-2 border-b-[#e0e0e0]">
            <button
              v-for="(sheet, index) in resolvedSheets"
              :key="index"
              :class="sheetTabClasses(activeSheetIndex === index)"
              @click="activeSheetIndex = index"
            >
              {{ sheet.name }}
            </button>
          </div>

          <!-- Spreadsheet table -->
          <div ref="tableContainer" :class="TABLE_CLASSES" @click="handleTableClick" v-html="renderedHtml"></div>
        </div>
      </div>

      <!-- Collapsible Editor -->
      <details v-if="!miniEditorOpen" ref="editorDetails" :class="SOURCE_CLASSES">
        <summary :class="SOURCE_SUMMARY_CLASSES">{{ t.editData }}</summary>
        <textarea ref="editorTextarea" v-model="editableData" :class="EDITOR_CLASSES" spellcheck="false" @input="handleDataEdit"></textarea>
        <button :class="APPLY_BUTTON_CLASSES" :disabled="!hasChanges" @click="applyChanges">{{ t.applyChanges }}</button>
      </details>

      <!-- Mini Editor at Bottom -->
      <div v-if="miniEditorOpen" class="bg-[#f8f8f8] border-t border-t-[#d0d0d0] shrink-0">
        <div class="flex items-center gap-2 px-4 py-2">
          <span v-if="miniEditorCell" :class="CELL_REF_CLASSES"> {{ indexToCol(miniEditorCell.col) }}{{ miniEditorCell.row + 1 }} </span>

          <!-- Type Selector -->
          <div class="flex gap-3 pr-3 border-r border-r-[#d0d0d0]">
            <label :class="RADIO_OPTION_CLASSES">
              <input v-model="miniEditorType" type="radio" value="string" :class="RADIO_INPUT_CLASSES" />
              {{ t.stringType }}
            </label>
            <label :class="RADIO_OPTION_CLASSES">
              <input v-model="miniEditorType" type="radio" value="object" :class="RADIO_INPUT_CLASSES" />
              {{ t.formulaType }}
            </label>
          </div>

          <!-- String input -->
          <input
            v-if="miniEditorType === 'string'"
            v-model="miniEditorValue"
            type="text"
            :class="FORM_INPUT_CLASSES"
            :placeholder="t.valuePlaceholder"
            @keyup.enter="saveMiniEditor"
          />

          <!-- Formula inputs -->
          <template v-if="miniEditorType === 'object'">
            <input
              v-model="miniEditorFormula"
              type="text"
              :class="FORM_INPUT_CLASSES"
              :placeholder="t.valueOrFormulaPlaceholder"
              @keyup.enter="saveMiniEditor"
            />
            <input v-model="miniEditorFormat" type="text" :class="FORM_INPUT_CLASSES" :placeholder="t.formatPlaceholder" @keyup.enter="saveMiniEditor" />
          </template>

          <button :class="SAVE_BUTTON_CLASSES" @click="saveMiniEditor">{{ t.update }}</button>
          <button :class="CANCEL_BUTTON_CLASSES" @click="closeMiniEditor">✕</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch, onMounted, onUnmounted } from "vue";
import { PLUGIN_RUNTIME_KEY, type ToolResult } from "gui-chat-protocol/vue";
import type { SpreadsheetToolData, SpreadsheetSheet } from "../core/types";
import { isSpreadsheetArtifactPath } from "../core/paths";
import { indexToColumn } from "../engine";
import { errorMessage as formatErrorMessage } from "../engine/guards";
import { applyCellHighlights, clearCellHighlights } from "./cellHighlights";
import {
  APPLY_BUTTON_CLASSES,
  CANCEL_BUTTON_CLASSES,
  CELL_REF_CLASSES,
  EDITOR_CLASSES,
  FORM_INPUT_CLASSES,
  RADIO_INPUT_CLASSES,
  RADIO_OPTION_CLASSES,
  SAVE_BUTTON_CLASSES,
  SOURCE_CLASSES,
  SOURCE_SUMMARY_CLASSES,
  TABLE_CLASSES,
  sheetTabClasses,
} from "./viewClasses";
import { isCrossOriginHttpUrl } from "./htmlText";
import { useT } from "../lang";
import { createSheetSession, type LoadOutcome } from "./sheetSession";
import { readLoadReply, readSaveReply, type LoadedWorkbook, type SaveReply } from "../core/dispatchReplies";
import { fileChangeAction } from "./fileFollow";
import { useCustomFunctions } from "./useCustomFunctions";
import { useMiniEditor } from "./useMiniEditor";
import { selectCellInEditor } from "./editorSelection";
import { downloadWorkbook } from "./excelDownload";
import { useRenderedTable } from "./useRenderedTable";

// Import all spreadsheet functions to populate the function registry
import "../engine/functions";

const t = useT();

// Absent outside a host that provides the gui-chat-protocol runtime (a
// standalone demo, MulmoChat): only inline workbooks render there.
const runtime = inject(PLUGIN_RUNTIME_KEY, undefined);
const locale = computed(() => runtime?.locale.value ?? "en");

const props = defineProps<{
  selectedResult: ToolResult<SpreadsheetToolData>;
}>();

const emit = defineEmits<{
  updateResult: [result: ToolResult];
}>();

const loading = ref(false);
const errorMessage = ref("");
const resolvedSheets = ref<SpreadsheetSheet[]>([]);
// The workbook's own functions (#114), visible to its formulas while it is calculated.
const customFunctions = useCustomFunctions(resolvedSheets);

// Declared before fetchSheets, which writes it once a load lands.
const editableData = ref(JSON.stringify(resolvedSheets.value || [], null, 2));

const readDispatchedSheets = (raw: unknown): LoadedWorkbook => {
  const loaded = readLoadReply(raw);
  if (!loaded) throw new Error(t.value.dataMustBeArray);
  return loaded;
};

const readDispatchedSave = (raw: unknown): SaveReply => {
  const reply = readSaveReply(raw);
  if (!reply) throw new Error(t.value.dataMustBeArray);
  return reply;
};

const session = createSheetSession(
  runtime
    ? {
        loadFromHost: (path) => runtime.dispatch({ kind: "loadSpreadsheet", path }, readDispatchedSheets),
        saveToHost: (path, sheets, baseVersion) =>
          runtime.dispatch(
            baseVersion === undefined ? { kind: "saveSpreadsheet", path, sheets } : { kind: "saveSpreadsheet", path, sheets, baseVersion },
            readDispatchedSave,
          ),
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
  const raw = props.selectedResult.data?.sheets;
  const outcome = await session.load(raw);
  if (!outcome) return;
  loading.value = false;
  if (outcome.kind === "sheets" && isSpreadsheetArtifactPath(raw)) session.adopt(raw, outcome.version);
  resolvedSheets.value = outcome.kind === "sheets" ? outcome.sheets : [];
  errorMessage.value = loadErrorText(outcome);
  editableData.value = JSON.stringify(resolvedSheets.value, null, 2);
  if (resetActiveSheet) activeSheetIndex.value = 0;
}

const fileChangedNotice = ref("");

/** A save the file refused because it changed since this View read it: the user's sheets,
 *  and the file's as they are now, until the user picks one. */
interface SaveConflict {
  path: string;
  mine: SpreadsheetSheet[];
  theirs: SpreadsheetSheet[];
  version: string;
}
const saveConflict = ref<SaveConflict | null>(null);

/** Read the workbook again after the host said it changed on disk — an agent, or
 *  another View, wrote it. Without this, this View kept the old sheets, and its
 *  next edit saved them over the newer file. */
async function refreshFromFile(path: string): Promise<void> {
  const outcome = await session.load(path);
  if (outcome?.kind !== "sheets" || props.selectedResult.data?.sheets !== path) return;
  // While the user is choosing, a newer file replaces the one they would take.
  const conflict = saveConflict.value;
  if (conflict && outcome.version !== undefined) {
    saveConflict.value = { ...conflict, theirs: outcome.sheets, version: outcome.version };
    return;
  }
  const action = fileChangeAction(outcome.sheets, resolvedSheets.value, hasChanges.value, savesInFlight);
  if (action === "same") return;
  if (action === "hold") {
    fileChangedNotice.value = t.value.fileChangedElsewhere;
    return;
  }
  session.adopt(path, outcome.version);
  showFileSheets(outcome.sheets);
  // An open cell editor holds the old cell; its Update would write that over the
  // change. It is closed, and the user told why, rather than left pointing at it.
  const editorWasOpen = miniEditorOpen.value;
  if (editorWasOpen) closeMiniEditor();
  fileChangedNotice.value = editorWasOpen ? t.value.cellEditorClosedByChange : "";
}

/** The sheets of saves sent but not yet finished, so their own file notification
 *  is recognised as this View's echo. */
const savesInFlight: SpreadsheetSheet[][] = [];

const fileSubscription: { stop: (() => void) | null } = { stop: null };

function stopFollowingFile(): void {
  fileSubscription.stop?.();
  fileSubscription.stop = null;
}

/** Subscribe to the workbook's file channel, replacing any earlier subscription. */
function followFile(raw: unknown): void {
  stopFollowingFile();
  fileChangedNotice.value = "";
  saveConflict.value = null;
  if (!runtime || !isSpreadsheetArtifactPath(raw)) return;
  fileSubscription.stop = runtime.pubsub.subscribe(`file:${raw}`, () => void refreshFromFile(raw));
}

/** Persist edited sheets to disk when file-backed, and emit updateResult. */
async function persistSheets(sheets: SpreadsheetSheet[]): Promise<void> {
  const raw = props.selectedResult.data?.sheets;
  const filePath = isSpreadsheetArtifactPath(raw) ? raw : null;
  if (filePath) {
    savesInFlight.push(sheets);
    try {
      const reply = await session.save(filePath, sheets);
      if (reply.kind === "conflict") {
        if (props.selectedResult.data?.sheets === raw) saveConflict.value = { path: filePath, mine: sheets, theirs: reply.sheets, version: reply.version };
        return;
      }
    } catch (error) {
      errorMessage.value = t.value.saveFailed(formatErrorMessage(error, t.value.unknownError));
      return;
    } finally {
      savesInFlight.splice(savesInFlight.indexOf(sheets), 1);
    }
    // The file is saved either way; only the result still on screen may take the edit.
    if (props.selectedResult.data?.sheets !== raw) return;
    // What is saved is what is shown now, so a notice about an earlier version is stale.
    fileChangedNotice.value = "";
    saveConflict.value = null;
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

/** Show the file's sheets, dropping what the editors hold. */
function showFileSheets(sheets: SpreadsheetSheet[]): void {
  resolvedSheets.value = sheets;
  editableData.value = JSON.stringify(sheets, null, 2);
}

/** Keep the file as it is now; the user's refused edit is dropped. */
function useFileVersion(): void {
  const conflict = saveConflict.value;
  if (!conflict) return;
  saveConflict.value = null;
  session.adopt(conflict.path, conflict.version);
  showFileSheets(conflict.theirs);
  if (miniEditorOpen.value) closeMiniEditor();
  fileChangedNotice.value = "";
}

/** Write the user's edit over the file as it is now. If the file changes yet again
 *  before this lands, the save is refused again and the user asked again. */
async function overwriteWithMine(): Promise<void> {
  const conflict = saveConflict.value;
  if (!conflict) return;
  saveConflict.value = null;
  session.adopt(conflict.path, conflict.version);
  await persistSheets(conflict.mine);
}

const activeSheetIndex = ref(0);

void fetchSheets(false);
followFile(props.selectedResult.data?.sheets);

const editorTextarea = ref<HTMLTextAreaElement | null>(null);
const editorDetails = ref<HTMLDetailsElement | null>(null);
const tableContainer = ref<HTMLDivElement | null>(null);

const {
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
} = useMiniEditor({ editableData, activeSheetIndex, persistSheets });

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

// Render the active sheet as HTML table
const renderedHtml = useRenderedTable({ resolvedSheets, activeSheetIndex, customFunctions, locale });

// Download as Excel file
const downloadExcel = () => downloadWorkbook(resolvedSheets.value, props.selectedResult.title);

function handleDataEdit() {
  // Just update the local state, don't apply yet
  // User needs to click "Apply Changes" button
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
  selectCellInEditor(editorTextarea.value, editableData.value, activeSheetIndex.value, rowIndex, colIndex);
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
  (sheets) => {
    void fetchSheets(true);
    followFile(sheets);
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

// Add keyboard event listener on mount
onMounted(() => {
  document.addEventListener("keydown", handleKeyboardNavigation);
});

// Remove keyboard event listener on unmount
onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyboardNavigation);
  stopFollowingFile();
});
</script>
