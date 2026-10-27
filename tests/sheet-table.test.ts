import { describe, expect, it } from "vitest";

import { readSheetTable } from "../src/lark/sheet-table";

function sheetModel(cells: string[][] = [["标题", "说明"], ["甲\n乙", ""]]): Record<string, unknown> {
  return {
    getRowCount: () => cells.length,
    getColumnCount: () => cells[0]!.length,
    getColumnWidth: (column: number) => [120, 360][column],
    getText: (row: number, column: number) => cells[row]![column],
    getValue: (row: number, column: number) => cells[row]![column],
    hasFormula: () => false,
    getSegmentArray: () => null,
    getDataValidation: () => null,
    getCellNoteJSON: () => null,
    getSpans: () => [],
    getChartMap: () => ({}),
    getFloatImageMap: () => ({}),
    getFloatBlocksMap: () => ({}),
    getEmbeddedBlocksMap: () => ({}),
    getAllComments: () => [],
    getHiddenRows: () => ({}),
    getHiddenCols: () => ({}),
  };
}

describe("readSheetTable", () => {
  it("reads all cells including whitespace, line breaks and empty cells", () => {
    expect(readSheetTable(sheetModel([["标题", "说明"], [" 甲\n乙 ", ""]]))).toEqual({
      cells: [["标题", "说明"], [" 甲\n乙 ", ""]], columnWidths: [120, 360],
    });
  });

  it.each([
    ["hasFormula", true], ["getSegmentArray", [{ text: "链接", link: "https://example.com" }]],
    ["getDataValidation", { type: "checkbox" }], ["getCellNoteJSON", { text: "批注" }],
    ["getSpans", [{ row: 0, col: 0, rowCount: 2, colCount: 1 }]],
    ["getChartMap", { chart: {} }], ["getFloatImageMap", { image: {} }],
    ["getFloatBlocksMap", { block: {} }], ["getEmbeddedBlocksMap", { block: {} }],
    ["getAllComments", [{}]], ["getHiddenRows", { "1": true }], ["getHiddenCols", { "1": true }],
    ["getValue", { type: "image" }],
  ])("rejects unsupported content reported by %s", (method, value) => {
    expect(() => readSheetTable({ ...sheetModel(), [method as string]: () => value })).toThrow();
  });

  it("rejects unavailable models, incomplete APIs and oversized data", () => {
    expect(() => readSheetTable(undefined)).toThrow();
    expect(() => readSheetTable({ ...sheetModel(), getFloatImageMap: undefined })).toThrow();
    expect(() => readSheetTable({ ...sheetModel(), getRowCount: () => 100_000 })).toThrow();
    expect(() => readSheetTable(sheetModel([["x".repeat(1_000_001), ""]]))).toThrow();
  });
});
