import type { Messages } from "./messages";

const ko: Messages = {
  untitled: "스프레드시트",
  sheetCount: (count) => `${count}개 시트`,
  excel: "Excel",
  valuePlaceholder: "값",
  valueOrFormulaPlaceholder: "값 또는 수식 (예: 100 또는 SUM(B2:B11))",
  formatPlaceholder: "형식 (예: $#,##0.00)",
  loading: "스프레드시트를 불러오는 중...",
  noData: "사용 가능한 스프레드시트 데이터가 없습니다",
  editData: "스프레드시트 데이터 편집",
  applyChanges: "변경 사항 적용",
  dataMustBeArray: "데이터는 시트 배열이어야 합니다",
  loadFailed: (error) => `스프레드시트 불러오기 실패: ${error}`,
  saveFailed: (error) => `스프레드시트 저장 실패: ${error}`,
  fileChangedElsewhere: "이 스프레드시트가 다른 곳에서 변경되었습니다. Edit Spreadsheet Data의 편집은 아직 적용되지 않았으며, 적용하면 그 변경을 덮어씁니다.",
  cellEditorClosedByChange: "이 스프레드시트가 다른 곳에서 변경되어 셀 편집기를 닫았습니다. 다시 셀을 클릭하여 편집하세요.",
  invalidJsonAlert: (error) => `잘못된 JSON 형식: ${error}`,
  unknownError: "알 수 없는 오류",
  update: "업데이트",
  stringType: "문자열",
  formulaType: "수식",
};

export default ko;
