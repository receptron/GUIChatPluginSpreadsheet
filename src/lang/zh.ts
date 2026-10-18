import type { Messages } from "./messages";

const zh: Messages = {
  untitled: "电子表格",
  sheetCount: (count) => `${count} 个工作表`,
  excel: "Excel",
  valuePlaceholder: "值",
  valueOrFormulaPlaceholder: "值或公式(例如 100 或 SUM(B2:B11))",
  formatPlaceholder: "格式(例如 $#,##0.00)",
  loading: "正在加载电子表格...",
  noData: "没有可用的电子表格数据",
  editData: "编辑电子表格数据",
  applyChanges: "应用更改",
  dataMustBeArray: "数据必须是工作表数组",
  loadFailed: (error) => `加载电子表格失败: ${error}`,
  saveFailed: (error) => `保存电子表格失败: ${error}`,
  fileChangedElsewhere: "此表格已在其他地方被修改。Edit Spreadsheet Data 中的编辑尚未应用；应用时会询问保留该修改还是覆盖它。",
  saveConflict: "您的编辑未保存：打开此表格后，它已在其他地方被修改。",
  useFileVersion: "使用已保存的版本",
  overwriteWithMine: "用我的编辑覆盖",
  cellEditorClosedByChange: "此表格已在其他地方被修改，因此已关闭单元格编辑器。请再次点击单元格进行编辑。",
  invalidJsonAlert: (error) => `无效的 JSON 格式: ${error}`,
  unknownError: "未知错误",
  update: "更新",
  stringType: "字符串",
  formulaType: "公式",
};

export default zh;
