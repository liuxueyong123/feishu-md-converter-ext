import { describe, expect, it } from "vitest";

import { convertSheetToTable, type SheetConversionManager } from "../src/lark/sheet-conversion";
import type { SheetTableData } from "../src/lark/sheet-table";

function setup() {
  const records = new Map<string, { id: string; snapshot: Record<string, unknown> }>([
    ["root", { id: "root", snapshot: { type: "page", children: ["sheet", "after"] } }],
    ["sheet", { id: "sheet", snapshot: { type: "sheet", author: "author", comments: [] } }],
  ]);
  let source: SheetTableData = { cells: [["标题", "说明"], ["甲\n乙", ""]], columnWidths: [120, 360] };
  let onApply = (_name: string): void => {};
  const children = (): string[] => records.get("root")!.snapshot.children as string[];
  let sequence = 0;
  const manager: SheetConversionManager = {
    getRecord: (id) => records.get(id),
    getBlockStructsByRecordId: (id) => {
      const siblings = children().map((recordId, index) => ({ id: index, record: { id: recordId }, children: [] }));
      const root = { id: 0, record: { id: "root" }, children: siblings };
      const item = siblings.find((s) => s.record.id === id);
      return item ? [{ ...item, parent: root }] : [];
    },
    applyTransaction: async (name, operation) => {
      onApply(name);
      operation({
        createChildren: (snapshots) => snapshots.map((snapshot) => {
          const id = `new-${sequence++}`;
          records.set(id, { id, snapshot: structuredClone(snapshot) });
          return id;
        }),
        insertChildren: (id, index, ids) => {
          (records.get(id)!.snapshot.children as string[]).splice(index, 0, ...ids);
        },
        replace: (id, path, value) => { records.get(id)!.snapshot[path[0]!] = value; },
        removeChildren: (id, ids) => {
          records.get(id)!.snapshot.children = children().filter((child) => !ids.includes(child));
        },
      });
    },
  };
  return {
    manager, records, children,
    read: () => source,
    change: () => { source = { ...source, cells: [["被协作者修改", "说明"]] }; },
    onApply: (callback: (name: string) => void) => { onApply = callback; },
  };
}

describe("convertSheetToTable", () => {
  it.each([{ locked: true }, { hidden: true }, { comments: ["comment"] }])(
    "preserves a protected source before creating anything: %j",
    async (metadata) => {
      const context = setup();
      Object.assign(context.records.get("sheet")!.snapshot, metadata);
      await expect(convertSheetToTable(context.manager, "sheet", context.read)).rejects.toThrow("保留原表");
      expect(context.children()).toEqual(["sheet", "after"]);
      expect(context.records.size).toBe(2);
    },
  );
  it("replaces the sheet in place with a verified native table including empty cells", async () => {
    const context = setup();
    const id = await convertSheetToTable(context.manager, "sheet", context.read);
    expect(context.children()).toEqual([id, "after"]);
    expect(context.records.get(id)?.snapshot).toMatchObject({ type: "table", header_row: true });
    const texts = [...context.records.values()].filter(({ snapshot }) => snapshot.type === "text");
    expect(texts.map(({ snapshot }) => (snapshot.text as { initialAttributedTexts: { text: { "0": string } } }).initialAttributedTexts.text["0"])).toEqual([
      "标题", "说明", "甲\n乙", "",
    ]);
    const cells = [...context.records.values()].filter(({ snapshot }) => snapshot.type === "table_cell");
    expect(cells).toHaveLength(4);
    expect(cells[0]!.snapshot.background_color).toBe("rgba(245,246,247,0.9)");
    expect(cells[1]!.snapshot.background_color).toBe("rgba(245,246,247,0.9)");
    expect(cells[2]!.snapshot.background_color).toBeUndefined();
  });

  it("keeps the source if it changes while creation is queued", async () => {
    const context = setup();
    context.onApply(() => context.change());
    await expect(convertSheetToTable(context.manager, "sheet", context.read)).rejects.toThrow("变化");
    expect(context.children()).toEqual(["sheet", "after"]);
  });

  it("keeps the source if it changes before removal", async () => {
    const context = setup();
    context.onApply((name) => { if (name.endsWith("replace-sheet")) context.change(); });
    await expect(convertSheetToTable(context.manager, "sheet", context.read)).rejects.toThrow("变化");
    expect(context.children()).toContain("sheet");
  });

  it("keeps the source when its sheet reference changes even if visible values match", async () => {
    const context = setup();
    context.records.get("sheet")!.snapshot.token = "original_sheet";
    context.onApply((name) => {
      if (name.endsWith("replace-sheet")) context.records.get("sheet")!.snapshot.token = "other_sheet";
    });
    await expect(convertSheetToTable(context.manager, "sheet", context.read)).rejects.toThrow("变化");
    expect(context.children()).toContain("sheet");
  });

  it("keeps the source if native header attributes are not saved", async () => {
    const context = setup();
    const apply = context.manager.applyTransaction;
    context.manager.applyTransaction = async (...args) => {
      await apply(...args);
      const header = [...context.records.values()].find((record) => record.snapshot.type === "text")!;
      (header.snapshot.text as Record<string, unknown>).apool = { nextNum: 0, numToAttrib: {} };
    };
    await expect(convertSheetToTable(context.manager, "sheet", context.read)).rejects.toThrow("校验");
    expect(context.children()).toContain("sheet");
  });

  it("does not remove the source when a saved cell cannot be verified", async () => {
    const context = setup();
    const apply = context.manager.applyTransaction;
    context.manager.applyTransaction = async (...args) => {
      await apply(...args);
      for (const record of context.records.values()) {
        if (record.snapshot.type === "text") { record.snapshot.text = {}; break; }
      }
    };
    await expect(convertSheetToTable(context.manager, "sheet", context.read)).rejects.toThrow("校验");
    expect(context.children()).toContain("sheet");
  });
});
