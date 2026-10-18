import type { Messages } from "./messages";

const ptBR: Messages = {
  untitled: "Planilha",
  sheetCount: (count) => (count === 1 ? "1 aba" : `${count} abas`),
  excel: "Excel",
  valuePlaceholder: "Valor",
  valueOrFormulaPlaceholder: "Valor ou Fórmula (ex.: 100 ou SUM(B2:B11))",
  formatPlaceholder: "Formato (ex.: $#,##0.00)",
  loading: "Carregando planilha...",
  noData: "Nenhum dado de planilha disponível",
  editData: "Editar dados da planilha",
  applyChanges: "Aplicar alterações",
  dataMustBeArray: "Os dados devem ser uma matriz de planilhas",
  loadFailed: (error) => `Falha ao carregar a planilha: ${error}`,
  saveFailed: (error) => `Falha ao salvar a planilha: ${error}`,
  fileChangedElsewhere:
    "Esta planilha foi alterada em outro lugar. Suas edições em Edit Spreadsheet Data ainda não foram aplicadas; aplicá-las substituirá essa alteração.",
  invalidJsonAlert: (error) => `Formato JSON inválido: ${error}`,
  unknownError: "Erro desconhecido",
  update: "Atualizar",
  stringType: "Texto",
  formulaType: "Fórmula",
};

export default ptBR;
