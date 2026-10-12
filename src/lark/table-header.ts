import { createBoldTextEdit, type BoldTextEdit } from "./text-format";

// Lark's native light neutral cell fill, verified against a saved table header.
export const TABLE_HEADER_BACKGROUND = "rgba(245,246,247,0.9)";

export interface TableHeaderPlan {
  cellRecordIds: string[];
  textEdits: BoldTextEdit[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createTableHeaderPlan(
  snapshot: unknown,
  getSnapshot: (recordId: string) => unknown,
): TableHeaderPlan {
  if (
    !isObject(snapshot) || snapshot.type !== "table" ||
    !Array.isArray(snapshot.rows_id) ||
    typeof snapshot.rows_id[0] !== "string" ||
    !Array.isArray(snapshot.columns_id) ||
    snapshot.columns_id.length === 0 || snapshot.columns_id.length > 100 ||
    !isObject(snapshot.cell_set)
  ) {
    throw new Error("表格标题行记录结构无效");
  }

  const cellRecordIds = new Set<string>();
  const textEdits = new Map<string, BoldTextEdit>();
  for (const columnId of snapshot.columns_id) {
    if (typeof columnId !== "string") throw new Error("表格列记录无效");
    const cell = snapshot.cell_set[`${snapshot.rows_id[0]}${columnId}`];
    if (!isObject(cell) || typeof cell.block_id !== "string" || !cell.block_id) {
      throw new Error("表格标题行单元格记录缺失");
    }
    if (cellRecordIds.has(cell.block_id)) continue;
    const cellSnapshot = getSnapshot(cell.block_id);
    if (
      !isObject(cellSnapshot) || cellSnapshot.type !== "table_cell" ||
      !Array.isArray(cellSnapshot.children)
    ) {
      throw new Error(`找不到表头单元格：${cell.block_id}`);
    }
    cellRecordIds.add(cell.block_id);
    for (const recordId of cellSnapshot.children) {
      if (typeof recordId !== "string") throw new Error("表头子块记录无效");
      const record = getSnapshot(recordId);
      if (!isObject(record)) throw new Error(`找不到表头子块：${recordId}`);
      if (record.type !== "text") continue;
      const text = record.text;
      const attributed = isObject(text) ? text.initialAttributedTexts : null;
      const zones = isObject(attributed) ? attributed.text : null;
      if (!isObject(zones) || typeof zones["0"] !== "string") {
        throw new Error(`表头文本结构无效：${recordId}`);
      }
      if (zones["0"].length > 0) {
        textEdits.set(recordId, createBoldTextEdit(recordId, zones["0"].length));
      }
    }
  }
  return { cellRecordIds: [...cellRecordIds], textEdits: [...textEdits.values()] };
}
