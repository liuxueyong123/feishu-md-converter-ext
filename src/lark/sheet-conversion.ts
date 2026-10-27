import { createEmptyTextRecord } from "./insertion-plan";
import type { SheetTableData } from "./sheet-table";
import { TABLE_HEADER_BACKGROUND } from "./table-header";

interface NativeStruct {
  id: number;
  record: { id: string };
  parent?: NativeStruct | null;
  children: NativeStruct[];
}

interface ConversionTransaction {
  createChildren(records: readonly Record<string, unknown>[], anchor: null): string[];
  insertChildren(parentId: string, index: number, ids: readonly string[]): void;
  replace(id: string, path: readonly string[], value: unknown): void;
  removeChildren(parentId: string, ids: readonly string[]): void;
}

export interface SheetConversionManager {
  getRecord(id: string): { snapshot?: Record<string, unknown> } | undefined;
  getBlockStructsByRecordId(id: string): NativeStruct[];
  applyTransaction(name: string, operation: (transaction: ConversionTransaction) => void, options?: { source?: string }): Promise<void>;
}

function locate(manager: SheetConversionManager, id: string): { parentId: string; index: number } {
  const struct = manager.getBlockStructsByRecordId(id)[0];
  const parent = struct?.parent;
  const index = parent?.children.findIndex((child) => child.id === struct?.id) ?? -1;
  if (!parent || index < 0) throw new Error("电子表格位置已变化，请重新扫描");
  return { parentId: parent.record.id, index };
}

function encodeTextAttributes(text: string, bold: boolean): string {
  const attribute = bold ? "*0" : "";
  const lastLineEnd = text.lastIndexOf("\n") + 1;
  const lines = text.split("\n").length - 1;
  return (lastLineEnd ? `${attribute}|${lines.toString(36)}+${lastLineEnd.toString(36)}` : "") +
    (text.length > lastLineEnd ? `${attribute}+${(text.length - lastLineEnd).toString(36)}` : "");
}

function createRecord(transaction: ConversionTransaction, record: Record<string, unknown>): string {
  const ids = transaction.createChildren([record], null);
  if (ids.length !== 1 || !ids[0]) throw new Error("Lark 未返回新建表格记录 ID，原表已保留");
  return ids[0];
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function verifyTable(manager: SheetConversionManager, id: string, expected: SheetTableData): void {
  const table = manager.getRecord(id)?.snapshot;
  const rows = table?.rows_id;
  const columns = table?.columns_id;
  const cells = object(table?.cell_set);
  const widths = object(table?.column_set);
  const failed = (): never => { throw new Error("新表格保存校验失败，原电子表格已保留，请检查新表后重新扫描"); };
  if (table?.type !== "table" || table.header_row !== true || !Array.isArray(rows) || !Array.isArray(columns) ||
    rows.length !== expected.cells.length || columns.length !== expected.columnWidths.length || !cells || !widths) return failed();
  for (let row = 0; row < rows.length; row += 1) {
    for (let column = 0; column < columns.length; column += 1) {
      if (typeof rows[row] !== "string" || typeof columns[column] !== "string") return failed();
      const entry = object(cells[`${rows[row]}${columns[column]}`]);
      const cell = typeof entry?.block_id === "string" ? manager.getRecord(entry.block_id)?.snapshot : null;
      const child = Array.isArray(cell?.children) && cell.children.length === 1 ? cell.children[0] : null;
      const text = typeof child === "string" ? manager.getRecord(child)?.snapshot : null;
      const zones = object(object(object(text?.text)?.initialAttributedTexts)?.text);
      const attributes = object(object(object(text?.text)?.initialAttributedTexts)?.attribs);
      const bold = object(object(object(text?.text)?.apool)?.numToAttrib)?.["0"];
      if (cell?.type !== "table_cell" || text?.type !== "text" || zones?.["0"] !== expected.cells[row]?.[column] ||
        object(widths[columns[column]])?.column_width !== expected.columnWidths[column] ||
        (row === 0 && (cell.background_color !== TABLE_HEADER_BACKGROUND ||
          JSON.stringify(bold) !== '["bold","true"]' ||
          attributes?.["0"] !== encodeTextAttributes(expected.cells[row]![column]!, true)))) return failed();
    }
  }
}

export async function convertSheetToTable(
  manager: SheetConversionManager,
  sourceId: string,
  readSource: () => SheetTableData,
): Promise<string> {
  const source = manager.getRecord(sourceId)?.snapshot;
  if (source?.type !== "sheet") throw new Error("找不到电子表格，请重新扫描");
  if (Array.isArray(source.comments) && source.comments.length > 0) throw new Error("电子表格含评论，已保留原表");
  if (source.locked === true || source.hidden === true) throw new Error("电子表格已锁定或隐藏，已保留原表");
  const sourceFingerprint = JSON.stringify(source);
  const data = readSource();
  const fingerprint = JSON.stringify(data);
  const ensureUnchanged = (): void => {
    const snapshot = manager.getRecord(sourceId)?.snapshot;
    if (JSON.stringify(snapshot) !== sourceFingerprint ||
      JSON.stringify(readSource()) !== fingerprint) throw new Error("电子表格内容已变化，原表已保留，请重新扫描");
  };
  let tableId = "";
  await manager.applyTransaction("lark-markdown-repair:create-sheet-table", (transaction) => {
    ensureUnchanged();
    const { parentId, index } = locate(manager, sourceId);
    const author = typeof source.author === "string" ? source.author : "";
    const base = { author, comments: [], revisions: [], locked: false, hidden: false };
    const rows = data.cells.map(() => `row${crypto.randomUUID()}`);
    const columns = data.columnWidths.map(() => `col${crypto.randomUUID()}`);
    const cellSet: Record<string, unknown> = {};
    tableId = createRecord(transaction, {
      ...base, type: "table", parent_id: parentId, rows_id: rows, columns_id: columns,
      column_set: Object.fromEntries(columns.map((id, index) => [id, { column_width: data.columnWidths[index] }])),
      cell_set: {}, header_row: true,
    });
    for (const [rowIndex, row] of data.cells.entries()) {
      for (const [columnIndex, text] of row.entries()) {
        const isHeader = rowIndex === 0;
        const cellId = createRecord(transaction, {
          ...base, type: "table_cell", parent_id: tableId, children: [], vertical_align: "top",
          ...(isHeader ? { background_color: TABLE_HEADER_BACKGROUND } : {}),
        });
        const textId = createRecord(transaction, {
          ...createEmptyTextRecord(cellId, author), align: "left",
          text: {
            apool: isHeader ? { nextNum: 1, numToAttrib: { "0": ["bold", "true"] } } : { nextNum: 0, numToAttrib: {} },
            initialAttributedTexts: { text: { "0": text }, attribs: { "0": encodeTextAttributes(text, isHeader) } },
          },
        });
        transaction.replace(cellId, ["children"], [textId]);
        cellSet[`${rows[rowIndex]}${columns[columnIndex]}`] = { block_id: cellId, merge_info: { row_span: 1, col_span: 1 } };
      }
    }
    transaction.replace(tableId, ["cell_set"], cellSet);
    transaction.insertChildren(parentId, index + 1, [tableId]);
  }, { source: "local-insert" });

  verifyTable(manager, tableId, data);
  await manager.applyTransaction("lark-markdown-repair:replace-sheet", (transaction) => {
    ensureUnchanged();
    verifyTable(manager, tableId, data);
    const current = locate(manager, sourceId);
    const replacement = locate(manager, tableId);
    if (current.parentId !== replacement.parentId || replacement.index !== current.index + 1) {
      throw new Error("原表或新表位置已变化，已保留两张表，请检查后重新扫描");
    }
    transaction.removeChildren(current.parentId, [sourceId]);
  }, { source: "local-delete" });
  if (manager.getBlockStructsByRecordId(sourceId).length > 0) throw new Error("原电子表格移除未完成，已保留两张表，请检查后重新扫描");
  return tableId;
}
