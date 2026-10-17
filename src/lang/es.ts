import type { Messages } from "./messages";

const es: Messages = {
  untitled: "Hoja de cálculo",
  sheetCount: (count) => count === 1 ? "1 hoja" : `${count} hojas`,
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
  invalidJsonAlert: (error) => `Formato JSON no válido: ${error}`,
  unknownError: "Error desconocido",
  update: "Actualizar",
  stringType: "Texto",
  formulaType: "Fórmula",
};

export default es;
