/**
 * Spreadsheet Plugin Samples
 */

import type { ToolSample } from "gui-chat-protocol";

export const samples: ToolSample[] = [
  {
    name: "Simple Budget",
    args: {
      title: "Monthly Budget",
      sheets: [
        {
          name: "Budget",
          data: [
            [{ v: "Category" }, { v: "Amount" }],
            [{ v: "Income" }, { v: 5000, f: "$#,##0.00" }],
            [{ v: "Rent" }, { v: -1500, f: "$#,##0.00" }],
            [{ v: "Utilities" }, { v: -200, f: "$#,##0.00" }],
            [{ v: "Food" }, { v: -600, f: "$#,##0.00" }],
            [{ v: "Transport" }, { v: -300, f: "$#,##0.00" }],
            [{ v: "Total" }, { v: "=SUM(B2:B6)", f: "$#,##0.00" }],
          ],
        },
      ],
    },
  },
  {
    name: "Sales Report",
    args: {
      title: "Q1 Sales Report",
      sheets: [
        {
          name: "Sales",
          data: [
            [{ v: "Product" }, { v: "Jan" }, { v: "Feb" }, { v: "Mar" }, { v: "Total" }],
            [{ v: "Widget A" }, { v: 1200 }, { v: 1350 }, { v: 1500 }, { v: "=SUM(B2:D2)" }],
            [{ v: "Widget B" }, { v: 800 }, { v: 920 }, { v: 1100 }, { v: "=SUM(B3:D3)" }],
            [{ v: "Widget C" }, { v: 450 }, { v: 480 }, { v: 520 }, { v: "=SUM(B4:D4)" }],
            [{ v: "Total" }, { v: "=SUM(B2:B4)" }, { v: "=SUM(C2:C4)" }, { v: "=SUM(D2:D4)" }, { v: "=SUM(E2:E4)" }],
          ],
        },
      ],
    },
  },
  {
    name: "Loan Calculator",
    args: {
      title: "Loan Calculator",
      sheets: [
        {
          name: "Calculator",
          data: [
            [{ v: "Loan Amount" }, { v: 250000, f: "$#,##0" }],
            [{ v: "Interest Rate" }, { v: 0.065, f: "0.00%" }],
            [{ v: "Term (Years)" }, { v: 30 }],
            [{ v: "" }, { v: "" }],
            [{ v: "Monthly Payment" }, { v: "=PMT(B2/12, B3*12, -B1)", f: "$#,##0.00" }],
            [{ v: "Total Interest" }, { v: "=B5*B3*12-B1", f: "$#,##0.00" }],
          ],
        },
      ],
    },
  },
];
