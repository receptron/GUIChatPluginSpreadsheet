import type { Messages } from "./messages";

const ja: Messages = {
  untitled: "スプレッドシート",
  sheetCount: (count) => `${count} シート`,
  excel: "Excel",
  valuePlaceholder: "値",
  valueOrFormulaPlaceholder: "値または数式（例: 100, SUM(B2:B11)）",
  formatPlaceholder: "書式（例: $#,##0.00）",
  loading: "スプレッドシート読み込み中...",
  noData: "スプレッドシートのデータがありません",
  editData: "スプレッドシートデータを編集",
  applyChanges: "変更を適用",
  dataMustBeArray: "データはシートの配列である必要があります",
  loadFailed: (error) => `スプレッドシートの読み込みに失敗: ${error}`,
  saveFailed: (error) => `スプレッドシートの保存に失敗: ${error}`,
  fileChangedElsewhere:
    "この表はほかの場所で書き換えられました。Edit Spreadsheet Data の編集はまだ適用されていません。適用すると、その書き換えを上書きします。",
  invalidJsonAlert: (error) => `不正な JSON 形式です: ${error}`,
  unknownError: "不明なエラー",
  update: "更新",
  stringType: "文字列",
  formulaType: "数式",
};

export default ja;
