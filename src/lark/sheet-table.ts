export interface SheetTableData {
  cells: string[][];
  columnWidths: number[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function call(model: Record<string, unknown>, method: string, ...args: number[]): unknown {
  const operation = model[method];
  if (typeof operation !== "function") {
    throw new Error(`电子表格读取接口不可用：${method}，请重新扫描`);
  }
  return operation.apply(model, args);
}

function hasItems(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  throw new Error("电子表格附加内容结构无法识别，已保留原表");
}

export function readSheetTable(model: unknown): SheetTableData {
  if (!isObject(model)) throw new Error("电子表格尚未加载，请定位到该表后重新扫描");
  const rowCount = call(model, "getRowCount");
  const columnCount = call(model, "getColumnCount");
  if (
    typeof rowCount !== "number" || !Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > 100 ||
    typeof columnCount !== "number" || !Number.isSafeInteger(columnCount) || columnCount < 1 || columnCount > 50 ||
    rowCount * columnCount > 2_000
  ) throw new Error("电子表格超出转换范围（最多 100 行、50 列、2000 个单元格），已保留原表");

  for (const [method, label] of [
    ["getSpans", "合并单元格"], ["getChartMap", "图表"],
    ["getFloatImageMap", "图片"], ["getFloatBlocksMap", "浮动内容"],
    ["getEmbeddedBlocksMap", "嵌入内容"], ["getAllComments", "评论"],
    ["getHiddenRows", "隐藏行"], ["getHiddenCols", "隐藏列"],
  ] as const) {
    if (hasItems(call(model, method))) throw new Error(`电子表格含${label}，暂不能无损转换，已保留原表`);
  }

  const columnWidths = Array.from({ length: columnCount }, (_, column) => {
    const width = call(model, "getColumnWidth", column);
    if (typeof width !== "number" || !Number.isFinite(width) || width < 40 || width > 2_000) {
      throw new Error("电子表格列宽超出转换范围，已保留原表");
    }
    return width;
  });
  let textLength = 0;
  const cells = Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column) => {
      const formula = call(model, "hasFormula", row, column);
      if (typeof formula !== "boolean") throw new Error("无法确认电子表格公式状态，已保留原表");
      if (formula) throw new Error("电子表格含公式，暂不能无损转换，已保留原表");
      for (const method of ["getSegmentArray", "getDataValidation", "getCellNoteJSON"]) {
        if (hasItems(call(model, method, row, column))) {
          throw new Error("电子表格含富文本、数据验证或备注，暂不能无损转换，已保留原表");
        }
      }
      const value = call(model, "getValue", row, column);
      if (value !== null && value !== undefined && !["string", "number", "boolean"].includes(typeof value)) {
        throw new Error("电子表格含非文字内容，暂不能无损转换，已保留原表");
      }
      const text = call(model, "getText", row, column);
      if (typeof text !== "string") throw new Error("电子表格单元格文字读取失败，已保留原表");
      textLength += text.length;
      if (textLength > 1_000_000) throw new Error("电子表格文字总量超出转换范围，已保留原表");
      return text;
    }),
  );
  return { cells, columnWidths };
}
