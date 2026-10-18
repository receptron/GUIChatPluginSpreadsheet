export interface Messages {
  untitled: string;
  sheetCount(count: number): string;
  excel: string;
  valuePlaceholder: string;
  valueOrFormulaPlaceholder: string;
  formatPlaceholder: string;
  loading: string;
  noData: string;
  editData: string;
  applyChanges: string;
  dataMustBeArray: string;
  loadFailed(error: string): string;
  saveFailed(error: string): string;
  fileChangedElsewhere: string;
  saveConflict: string;
  useFileVersion: string;
  overwriteWithMine: string;
  cellEditorClosedByChange: string;
  invalidJsonAlert(error: string): string;
  unknownError: string;
  update: string;
  stringType: string;
  formulaType: string;
}
