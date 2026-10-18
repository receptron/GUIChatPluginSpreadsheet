import type { Messages } from "./messages";

const de: Messages = {
  untitled: "Tabelle",
  sheetCount: (count) => (count === 1 ? "1 Blatt" : `${count} Blätter`),
  excel: "Excel",
  valuePlaceholder: "Wert",
  valueOrFormulaPlaceholder: "Wert oder Formel (z. B. 100 oder SUM(B2:B11))",
  formatPlaceholder: "Format (z. B. $#,##0.00)",
  loading: "Tabelle wird geladen...",
  noData: "Keine Tabellendaten verfügbar",
  editData: "Tabellendaten bearbeiten",
  applyChanges: "Änderungen übernehmen",
  dataMustBeArray: "Daten müssen ein Array von Blättern sein",
  loadFailed: (error) => `Laden der Tabelle fehlgeschlagen: ${error}`,
  saveFailed: (error) => `Speichern der Tabelle fehlgeschlagen: ${error}`,
  fileChangedElsewhere:
    "Diese Tabelle wurde an anderer Stelle geändert. Ihre Änderungen unter Edit Spreadsheet Data sind noch nicht übernommen; wenn Sie sie übernehmen, ersetzen sie diese Änderung.",
  cellEditorClosedByChange:
    "Diese Tabelle wurde an anderer Stelle geändert, daher wurde der Zelleditor geschlossen. Klicken Sie erneut auf die Zelle, um sie zu bearbeiten.",
  invalidJsonAlert: (error) => `Ungültiges JSON-Format: ${error}`,
  unknownError: "Unbekannter Fehler",
  update: "Aktualisieren",
  stringType: "Zeichenkette",
  formulaType: "Formel",
};

export default de;
