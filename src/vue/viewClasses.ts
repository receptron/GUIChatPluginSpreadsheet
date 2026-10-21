// Tailwind classes for View.vue that are repeated or too long to read inline. The values are the ones
// its scoped stylesheet had, so the look does not change.

const FOCUS_RING = "focus:outline-none focus:border-[#217346] focus:shadow-[0_0_0_2px_rgba(33,115,70,0.1)]";
const MONOSPACE = "font-[family-name:Consolas,'MS_Gothic','BIZ_UDGothic',monospace]";

/** The table XLSX renders into the container: its cells, alternate rows, hover, and the editing and
 *  referenced highlights cellHighlights.ts puts on a cell. */
export const TABLE_CLASSES = [
  "overflow-x-auto bg-white",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:font-[family-name:'Segoe_UI',Arial,sans-serif] [&_table]:text-[0.9em]",
  "[&_td]:border [&_td]:border-[#d0d0d0] [&_td]:px-[0.75em] [&_td]:py-[0.5em] [&_td]:text-left",
  "[&_th]:border [&_th]:border-[#d0d0d0] [&_th]:px-[0.75em] [&_th]:py-[0.5em] [&_th]:text-left [&_th]:bg-[#f5f5f5] [&_th]:font-semibold [&_th]:text-[#333]",
  // Hover is marked important so it wins over the alternate-row colour whichever Tailwind emits first.
  "[&_tr:nth-child(even)]:bg-[#fafafa] [&_tr:hover]:bg-[#f0f0f0]!",
  "[&_.cell-editing]:bg-[#e8f5e9]! [&_.cell-editing]:outline-2! [&_.cell-editing]:outline-[#217346]! [&_.cell-editing]:-outline-offset-2",
  "[&_.cell-referenced]:bg-[#fff3e0]! [&_.cell-referenced]:outline-2! [&_.cell-referenced]:outline-[#ff9800]! [&_.cell-referenced]:-outline-offset-2",
].join(" ");

const SHEET_TAB = "px-[1em] py-[0.5em] rounded-t cursor-pointer text-[0.9em] transition-[background-color] duration-200";

/** A sheet tab, the active one joined to the table below it. */
export const sheetTabClasses = (active: boolean): string =>
  active
    ? `${SHEET_TAB} border-none border-b-2 [border-bottom-style:solid] border-b-white bg-white text-[#333] font-medium -mb-[2px]`
    : `${SHEET_TAB} border-none bg-[#f5f5f5] text-[#666] hover:bg-[#e8e8e8]`;

export const SOURCE_CLASSES = `group p-2 bg-[#f5f5f5] border-t border-t-[#e0e0e0] ${MONOSPACE} text-[0.85rem] shrink-0`;

export const SOURCE_SUMMARY_CLASSES = "cursor-pointer select-none p-2 bg-[#e8e8e8] rounded font-medium text-[#333] hover:bg-[#d8d8d8] group-open:mb-2";

export const EDITOR_CLASSES = `w-full h-[40vh] p-4 bg-white border border-[#ccc] rounded text-[#333] font-[family-name:'Courier_New','MS_Gothic','BIZ_UDGothic',monospace] text-[0.9rem] resize-y mb-2 leading-normal ${FOCUS_RING}`;

export const APPLY_BUTTON_CLASSES =
  "px-4 py-2 border-none bg-[#217346] text-white rounded cursor-pointer text-[0.9rem] font-medium transition-[background] duration-200 hover:bg-[#1e6a3f] active:bg-[#1a5c36] disabled:bg-[#cccccc] disabled:text-[#666666] disabled:cursor-not-allowed disabled:opacity-60";

export const CELL_REF_CLASSES = `${MONOSPACE} font-semibold text-[#217346] text-[0.85rem] min-w-8`;

export const RADIO_OPTION_CLASSES = "flex items-center gap-1 cursor-pointer text-[0.85rem] text-[#555]";

export const RADIO_INPUT_CLASSES = "cursor-pointer w-[0.9rem] h-[0.9rem]";

export const FORM_INPUT_CLASSES = `flex-1 min-w-[120px] px-[0.6rem] py-[0.4rem] border border-[#ccc] rounded-[3px] text-[0.85rem] transition-[border-color] duration-200 placeholder:text-[#999] placeholder:text-[0.8rem] ${FOCUS_RING}`;

const MINI_BUTTON = "border-none rounded-[3px] cursor-pointer font-medium transition-[background] duration-200";

export const SAVE_BUTTON_CLASSES = `${MINI_BUTTON} px-[0.8rem] py-[0.4rem] text-[0.85rem] bg-[#217346] text-white hover:bg-[#1e6a3f]`;

export const CANCEL_BUTTON_CLASSES = `${MINI_BUTTON} p-[0.4rem] text-[1.2rem] leading-none bg-transparent text-[#666] hover:text-[#333] hover:bg-[#e0e0e0]`;
