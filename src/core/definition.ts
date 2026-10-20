/**
 * Spreadsheet Tool Definition (Schema)
 */

import type { ToolDefinition } from "gui-chat-protocol";

export const TOOL_NAME = "presentSpreadsheet";

export const TOOL_DEFINITION: ToolDefinition = {
  type: "function",
  name: TOOL_NAME,
  description: "Display an Excel-like spreadsheet with formulas and calculations.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the spreadsheet",
      },
      sheets: {
        type: "array",
        description: "Sheets to render as spreadsheet tabs. Each sheet includes a name and 2D array of cells (rows x columns).",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Sheet name (e.g., 'Sales Q1', 'Summary')",
            },
            data: {
              type: "array",
              description:
                'Rows of cells. Each cell is an object with \'v\' (value) and \'f\' (format). Use Excel-style A1 notation in formulas: columns are letters (A, B, C...), rows are 1-based numbers (1, 2, 3...). Values can be text, numbers, dates, or formulas. Examples: [{"v": "Product"}, {"v": 2024, "f": "#,##0"}, {"v": "01/15/2025", "f": "MM/DD/YYYY"}, {"v": "=B2*1.05", "f": "$#,##0.00"}]. Format codes: \'$#,##0.00\' (currency), \'#,##0\' (integer), \'0.00%\' (percent), \'0.00\' (decimal), \'MM/DD/YYYY\' (date), \'DD-MMM-YYYY\' (date), \'YYYY-MM-DD\' (ISO date).',
              items: {
                type: "array",
                description: "Row of cells. Each cell is an object with value and format.",
                items: {
                  type: "object",
                  description: "Cell object with value and optional format. If value is a string starting with '=', it's treated as a formula.",
                  properties: {
                    v: {
                      oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
                      description:
                        "Cell value. Can be text, number, date, or formula (string starting with '='). Examples: 'Revenue', 1500000, '01/15/2025', '=SUM(A1:A10)', '=B2-TODAY()'. Date strings like '01/15/2025' are automatically parsed to date serial numbers.",
                    },
                    f: {
                      type: "string",
                      description:
                        "Optional format code for displaying the value. Common formats: '$#,##0.00' (currency), '#,##0' (integer), '0.00%' (percent), '0.00' (decimal), 'MM/DD/YYYY' (date), 'DD-MMM-YYYY' (date), 'YYYY-MM-DD' (ISO date)",
                    },
                  },
                  required: ["v"],
                },
              },
            },
            functions: {
              type: "array",
              description:
                "Optional. Functions this workbook defines, for an analysis no built-in function does (a moving average, a custom score). A formula on any sheet calls one by name, e.g. =MOVING.AVG(B2:B100, 7), and it recalculates like any formula. Each is a JavaScript function body run in a sandbox with no network, files, DOM or timers, at most 50 ms per call. A range argument arrives as rows of cells (an array of arrays; a blank cell is null); a single cell and any other argument as its value. A whole column (A:A) arrives as the rows its sheet's data reaches. Return a number, text or true/false, or a table as an array of rows ([[1, 2], [3, 4]]; a flat array is one column), which spills from the cell; anything else, a thrown error or a time-out shows as an error in the cell.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Letters and digits, parts joined by dots (MOVING.AVG). Not the name of a built-in function." },
                  params: { type: "array", items: { type: "string" }, description: 'Parameter names, in call order, e.g. ["values", "n"].' },
                  body: {
                    type: "string",
                    description:
                      "The function body, e.g. \"const xs = values.flat().filter((v) => typeof v === 'number'); const tail = xs.slice(-n); return tail.reduce((a, b) => a + b, 0) / tail.length;\"",
                  },
                  description: { type: "string", description: "What it computes." },
                },
                required: ["name", "params", "body"],
              },
            },
          },
          required: ["name", "data"],
        },
      },
    },
    required: ["title", "sheets"],
  },
};

export const SYSTEM_PROMPT = `Use ${TOOL_NAME} whenever the user needs a spreadsheet-style table, multi-step math, or dynamic what-if analysis—do not summarize in text. Build LIVE sheets where every cell is an object {"v": value, "f": format}. For formulas, set "v" to a string starting with "=" (e.g., {"v": "=B2*1.05", "f": "$#,##0.00"}). For dates, use date strings like "01/15/2025" or date formulas like "=TODAY()" or "=DATE(2025,1,15)". The spreadsheet auto-parses common date formats (MM/DD/YYYY, YYYY-MM-DD, DD-MMM-YYYY) into date serial numbers for calculations. Date arithmetic works: "=B2-TODAY()" calculates days between dates. Never pre-calculate; let the spreadsheet compute using cell refs, functions (SUM, AVERAGE, IF, TODAY, DATE, DATEDIF, etc.), and arithmetic. Standard formats: "$#,##0.00" currency, "#,##0" integer, "0.00%" percent, "0.00" decimal, "MM/DD/YYYY" date, "DD-MMM-YYYY" date, "YYYY-MM-DD" ISO date. Format is optional for plain text/numbers. When an analysis needs a method no built-in function has, define it once in the sheet's "functions" and call it from formulas, rather than pasting a computed number: it then recalculates when the data changes.`;
