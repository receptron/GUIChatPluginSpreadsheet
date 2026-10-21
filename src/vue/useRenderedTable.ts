// The active sheet calculated and rendered as the HTML table the View shows.

import { computed, type Ref } from "vue";
import * as XLSX from "xlsx";
import type { SpreadsheetSheet, StorableCell } from "../core/types";
import { SpreadsheetEngine, prefersDayFirst, normalizeData, type SheetData, type CellValue } from "../engine";
import { errorMessage as formatErrorMessage } from "../engine/guards";
import { calculateWith } from "../engine/customFunctions";
import { escapeHtml } from "./htmlText";
import type { useCustomFunctions } from "./useCustomFunctions";

// `normalizeData` is the engine's own reader for the stored cell forms (bare
// values, `null` gaps, flat rows); `calculate` runs it internally anyway, so
// applying it here only meets the engine's declared type at the call site.
const toEngineSheet = (sheet: SpreadsheetSheet): SheetData => ({ name: sheet.name, data: normalizeData(sheet.data) });

/** What the table is rendered from. */
export interface RenderedTableSources {
  resolvedSheets: Ref<SpreadsheetSheet[]>;
  activeSheetIndex: Ref<number>;
  customFunctions: ReturnType<typeof useCustomFunctions>;
  locale: Ref<string>;
}

export function useRenderedTable({ resolvedSheets, activeSheetIndex, customFunctions, locale }: RenderedTableSources) {
  // Create spreadsheet engine instance
  const engine = new SpreadsheetEngine();

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
    const result = calculateWith(customFunctions.value, () => engine.calculate(sheet, allSheets));

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

  return renderedHtml;
}
