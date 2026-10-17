import type { Messages } from "./messages";

const en: Messages = {
  untitled: "Spreadsheet",
  sheetCount: (count) => count === 1 ? "1 sheet" : `${count} sheets`,
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
  invalidJsonAlert: (error) => `Invalid JSON format: ${error}`,
  unknownError: "Unknown error",
  update: "Update",
  stringType: "String",
  formulaType: "Formula",
};

export default en;
