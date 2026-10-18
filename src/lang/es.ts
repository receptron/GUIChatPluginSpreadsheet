import type { Messages } from "./messages";

const es: Messages = {
  untitled: "Hoja de cálculo",
  sheetCount: (count) => (count === 1 ? "1 hoja" : `${count} hojas`),
  excel: "Excel",
  valuePlaceholder: "Valor",
  valueOrFormulaPlaceholder: "Valor o Fórmula (ej. 100 o SUM(B2:B11))",
  formatPlaceholder: "Formato (ej. $#,##0.00)",
  loading: "Cargando la hoja de cálculo...",
  noData: "No hay datos de hoja de cálculo disponibles",
  editData: "Editar datos de la hoja de cálculo",
  applyChanges: "Aplicar cambios",
  dataMustBeArray: "Los datos deben ser una matriz de hojas",
  loadFailed: (error) => `Error al cargar la hoja de cálculo: ${error}`,
  saveFailed: (error) => `Error al guardar la hoja de cálculo: ${error}`,
  fileChangedElsewhere:
    "Esta hoja de cálculo se modificó en otro lugar. Sus cambios en Edit Spreadsheet Data aún no se han aplicado; al aplicarlos se le preguntará si conservar esa modificación o reemplazarla.",
  saveConflict: "Su cambio no se guardó: esta hoja de cálculo se modificó en otro lugar después de abrirla.",
  useFileVersion: "Usar la versión guardada",
  overwriteWithMine: "Sobrescribir con mi cambio",
  cellEditorClosedByChange:
    "Esta hoja de cálculo se modificó en otro lugar, así que se cerró el editor de celdas. Haga clic de nuevo en la celda para editarla.",
  invalidJsonAlert: (error) => `Formato JSON no válido: ${error}`,
  unknownError: "Error desconocido",
  update: "Actualizar",
  stringType: "Texto",
  formulaType: "Fórmula",
};

export default es;
