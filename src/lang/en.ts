import type { Messages } from "./messages";

const en: Messages = {
  untitled: "Spreadsheet",
  sheetCount: (count) => (count === 1 ? "1 sheet" : `${count} sheets`),
  excel: "Excel",
  valuePlaceholder: "Value",
  valueOrFormulaPlaceholder: "Value or Formula (e.g., 100 or SUM(B2:B11))",
  formatPlaceholder: "Format (e.g., $#,##0.00)",
  loading: "Loading spreadsheet...",
  noData: "No spreadsheet data available",
  editData: "Edit Spreadsheet Data",
  applyChanges: "Apply Changes",
  dataMustBeArray: "Data must be an array of sheets",
  loadFailed: (error) => `Failed to load spreadsheet: ${error}`,
  saveFailed: (error) => `Failed to save spreadsheet: ${error}`,
  fileChangedElsewhere:
    "This spreadsheet was changed elsewhere. Your edits in Edit Spreadsheet Data are not applied yet; applying them asks whether to keep that change or replace it.",
  saveConflict: "Your edit was not saved: this spreadsheet was changed elsewhere after you opened it.",
  useFileVersion: "Use the saved version",
  overwriteWithMine: "Save my edit over it",
  cellEditorClosedByChange: "This spreadsheet was changed elsewhere, so the cell editor was closed. Click the cell again to edit it.",
  invalidJsonAlert: (error) => `Invalid JSON format: ${error}`,
  unknownError: "Unknown error",
  update: "Update",
  stringType: "String",
  formulaType: "Formula",
};

export default en;
