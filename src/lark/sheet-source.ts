import type { SheetConversionManager } from "./sheet-conversion";
import { readSheetTable, type SheetTableData } from "./sheet-table";

const sheetManagers = new WeakMap<SheetConversionManager, Record<string, unknown>>();

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function findSheetManager(manager: SheetConversionManager): Record<string, unknown> | null {
  for (const element of document.querySelectorAll('[data-block-type="sheet"]')) {
    for (const node of [element, ...element.querySelectorAll("*")].slice(0, 160)) {
      const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
      let fiber = key ? object((node as unknown as Record<string, unknown>)[key]) : null;
      for (let depth = 0; fiber && depth < 30; depth += 1, fiber = object(fiber.return)) {
        for (const candidate of [object(fiber.memoizedProps)?.block, fiber.stateNode]) {
          const block = object(candidate);
          if (block?.blockManager !== manager) continue;
          const bridge = object(object(block.bridge)?.bridge);
          const sheetManager = object(bridge?.sheetManager);
          if (sheetManager && typeof sheetManager.getSheetFromId === "function") {
            sheetManagers.set(manager, sheetManager);
            return sheetManager;
          }
        }
      }
    }
  }
  return sheetManagers.get(manager) ?? null;
}

export function readEmbeddedSheet(manager: SheetConversionManager, recordId: string): SheetTableData {
  const snapshot = manager.getRecord(recordId)?.snapshot;
  if (snapshot?.type !== "sheet" || typeof snapshot.token !== "string") throw new Error("找不到电子表格记录，请重新扫描");
  if (Array.isArray(snapshot.comments) && snapshot.comments.length > 0) throw new Error("电子表格含评论，已保留原表");
  if (snapshot.locked === true || snapshot.hidden === true) throw new Error("电子表格已锁定或隐藏，已保留原表");
  const match = /^[a-zA-Z0-9]+_([a-zA-Z0-9]+)$/u.exec(snapshot.token);
  if (!match) throw new Error("暂不支持此电子表格引用格式，已保留原表");
  const sheetManager = findSheetManager(manager);
  if (!sheetManager || typeof sheetManager.getSheetFromId !== "function") throw new Error("电子表格尚未加载，请定位到该表后重新扫描");
  return readSheetTable(sheetManager.getSheetFromId(match[1]));
}
