import { afterEach, beforeAll, describe, expect, it, type Mock, vi } from "vitest";

import { callMainWorld, type CreatedDiagram } from "../src/lark/main-bridge";

interface TestRecord {
  id: string;
  snapshot: Record<string, unknown>;
}

interface TestStruct {
  id: number;
  record: TestRecord;
  children: TestStruct[];
  parent?: TestStruct;
}

describe("native heading spacing transaction", () => {
  beforeAll(async () => {
    await import("../src/main-world");
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function mountManager(): {
    records: Map<string, TestRecord>;
    root: TestStruct;
    applyTransaction: Mock<(
      name: string,
      operation: (transaction: unknown) => void,
    ) => Promise<void>>;
  } {
    const records = new Map<string, TestRecord>();
    const root: TestStruct = {
      id: 0, record: { id: "root", snapshot: { type: "page" } }, children: [],
    };
    const structs = new Map<string, TestStruct>([["root", root]]);
    function append(id: string, snapshot: Record<string, unknown>, index: number): void {
      const record = { id, snapshot };
      const struct = { id: structs.size, record, children: [], parent: root };
      records.set(id, record);
      structs.set(id, struct);
      root.children.splice(index, 0, struct);
    }
    append("first", { type: "heading1" }, 0);
    append("body", {
      type: "text", children: [],
      text: { initialAttributedTexts: { text: { "0": "正文" } } },
    }, 1);
    append("heading", {
      type: "heading2", author: "author", parent_id: "root",
      text: { initialAttributedTexts: { text: { "0": "章节标题" } } },
    }, 2);
    append("subheading", { type: "heading3" }, 3);
    const applyTransaction = vi.fn(async (
      _name: string,
      operation: (transaction: unknown) => void,
    ) => {
      const pending = new Map<string, Record<string, unknown>>();
      operation({
        createChildren: (snapshots: Record<string, unknown>[]) => snapshots.map((snapshot) => {
          const id = `blank-${records.size + pending.size}`;
          pending.set(id, snapshot);
          return id;
        }),
        insertChildren: (_parentId: string, index: number, ids: string[]) => {
          ids.forEach((id, offset) => {
            const snapshot = pending.get(id);
            if (!snapshot) throw new Error("Missing created record");
            append(id, snapshot, index + offset);
          });
        },
        removeChildren: (_parentId: string, ids: string[]) => {
          root.children = root.children.filter(({ record }) => !ids.includes(record.id));
          ids.forEach((id) => {
            records.delete(id);
            structs.delete(id);
          });
        },
      });
    });
    const manager = {
      getRecord: (id: string) => records.get(id),
      getBlockStructsByRecordId: (id: string) => structs.has(id) ? [structs.get(id)] : [],
      applyTransaction,
    };
    const node = document.createElement("div");
    node.dataset.blockType = "page";
    Object.assign(node, {
      __reactFiber$test: { memoizedProps: { block: { blockManager: manager, record: root.record } } },
    });
    document.body.append(node);
    return { records, root, applyTransaction };
  }

  it("scans native predecessors without mounted heading or paragraph DOM", async () => {
    mountManager();
    await expect(callMainWorld("read-heading-spacing", {
      recordIds: ["first", "heading", "subheading"],
    })).resolves.toEqual([{ recordId: "heading", preview: "章节标题" }]);
  });

  it("persists one empty paragraph before the heading and repeated repair is a no-op", async () => {
    const { records, root, applyTransaction } = mountManager();
    const id = await callMainWorld<string>("insert-heading-spacing", { recordId: "heading" });
    expect(root.children.map(({ record }) => record.id)).toEqual([
      "first", "body", id, "heading", "subheading",
    ]);
    expect(records.get(id)?.snapshot).toMatchObject({
      type: "text", parent_id: "root", author: "author",
      text: { initialAttributedTexts: { text: { "0": "" } } },
    });
    await expect(callMainWorld("insert-heading-spacing", { recordId: "heading" })).resolves.toBeNull();
    expect(applyTransaction).toHaveBeenCalledTimes(1);
  });

  it("rechecks the predecessor if an empty paragraph was added after scanning", async () => {
    const { records, applyTransaction } = mountManager();
    await callMainWorld("read-heading-spacing", { recordIds: ["heading"] });
    const body = records.get("body");
    if (!body) throw new Error("Missing body");
    body.snapshot.text = { initialAttributedTexts: { text: { "0": "" } } };
    await expect(callMainWorld("insert-heading-spacing", { recordId: "heading" })).resolves.toBeNull();
    expect(applyTransaction).not.toHaveBeenCalled();
  });

  it("keeps one blank between a migrated diagram and a heading repaired first", async () => {
    const { records, root } = mountManager();
    const source = records.get("body")!;
    source.snapshot = { type: "code", author: "author" };
    const blankId = await callMainWorld<string>("insert-heading-spacing", { recordId: "heading" });
    const [created] = await callMainWorld<CreatedDiagram[]>("create-diagrams", {
      targets: [{ recordId: "body" }],
    });
    await callMainWorld("delete-records", { recordIds: ["body"] });

    expect(root.children.map(({ record }) => record.id)).toEqual([
      "first", created!.diagramRecordId, blankId, "heading", "subheading",
    ]);
    expect(created!.trailingTextRecordId).toBeNull();
    await expect(callMainWorld("read-heading-spacing", { recordIds: ["heading"] })).resolves.toEqual([]);
  });

  it.each(["", " \n\t", "\u200B\u200C\u200D\u2060\uFEFF"])(
    "reuses an existing empty paragraph %j after Mermaid without adding another",
    async (text) => {
      const { records, root } = mountManager();
      records.get("body")!.snapshot = { type: "code" };
      records.get("heading")!.snapshot = {
        type: "text", children: [],
        text: { initialAttributedTexts: { text: { "0": text } } },
      };
      const [created] = await callMainWorld<CreatedDiagram[]>("create-diagrams", {
        targets: [{ recordId: "body" }],
      });
      expect(root.children.map(({ record }) => record.id)).toEqual([
        "first", "body", created!.diagramRecordId, "heading", "subheading",
      ]);
      expect(created!.trailingTextRecordId).toBeNull();
    },
  );

  it("adds one trailing blank when diagrams are repaired before headings", async () => {
    const { records, root } = mountManager();
    records.get("body")!.snapshot = { type: "code" };
    const [created] = await callMainWorld<CreatedDiagram[]>("create-diagrams", {
      targets: [{ recordId: "body" }],
    });
    await callMainWorld("delete-records", { recordIds: ["body"] });
    await expect(callMainWorld("insert-heading-spacing", { recordId: "heading" })).resolves.toBeNull();
    expect(root.children.map(({ record }) => record.id)).toEqual([
      "first", created!.diagramRecordId, created!.trailingTextRecordId, "heading", "subheading",
    ]);
    expect(records.get(created!.trailingTextRecordId!)?.snapshot).toMatchObject({
      type: "text", text: { initialAttributedTexts: { text: { "0": "" } } },
    });
  });

  it.each([
    { type: "text", text: { initialAttributedTexts: { text: { "0": "正文" } } } },
    { type: "text", children: ["nested"], text: { initialAttributedTexts: { text: { "0": "" } } } },
    { type: "text" },
  ])("does not reuse a nonempty or unreadable following paragraph: %j", async (snapshot) => {
    const { records, root } = mountManager();
    records.get("body")!.snapshot = { type: "code" };
    records.get("heading")!.snapshot = snapshot;
    const [created] = await callMainWorld<CreatedDiagram[]>("create-diagrams", {
      targets: [{ recordId: "body" }],
    });
    expect(created!.trailingTextRecordId).toEqual(expect.any(String));
    expect(root.children.map(({ record }) => record.id)).toEqual([
      "first", "body", created!.diagramRecordId, created!.trailingTextRecordId, "heading", "subheading",
    ]);
    expect(records.get("heading")!.snapshot).toEqual(snapshot);
  });

  it("reads the following paragraph inside the diagram creation transaction", async () => {
    const { records, root, applyTransaction } = mountManager();
    records.get("body")!.snapshot = { type: "code" };
    const original = applyTransaction.getMockImplementation();
    applyTransaction.mockImplementationOnce(async (name, operation) => {
      await callMainWorld("insert-heading-spacing", { recordId: "heading" });
      await original?.(name, operation);
    });
    const [created] = await callMainWorld<CreatedDiagram[]>("create-diagrams", {
      targets: [{ recordId: "body" }],
    });
    expect(created!.trailingTextRecordId).toBeNull();
    expect(root.children.map(({ record }) => record.snapshot.type)).toEqual([
      "heading1", "code", "isv", "text", "heading2", "heading3",
    ]);
  });

  it("rejects missing predecessors or invalid targets before creating records", async () => {
    const { records, applyTransaction } = mountManager();
    records.delete("body");
    await expect(callMainWorld("insert-heading-spacing", { recordId: "heading" })).rejects.toThrow("找不到标题前");
    await expect(callMainWorld("insert-heading-spacing", { recordId: "body" })).rejects.toThrow();
    expect(applyTransaction).not.toHaveBeenCalled();
  });

  it("uses the current heading position when collaboration changes order before the transaction", async () => {
    const { records, root, applyTransaction } = mountManager();
    const original = applyTransaction.getMockImplementation();
    applyTransaction.mockImplementationOnce(async (name, operation) => {
      const record = { id: "new-body", snapshot: { type: "bullet" } };
      records.set(record.id, record);
      root.children.splice(2, 0, { id: 99, record, children: [], parent: root });
      await original?.(name, operation);
    });
    const id = await callMainWorld<string>("insert-heading-spacing", { recordId: "heading" });
    expect(root.children.map(({ record }) => record.id)).toEqual([
      "first", "body", "new-body", id, "heading", "subheading",
    ]);
  });

  it("skips creation if the predecessor becomes blank while the transaction is queued", async () => {
    const { records, root, applyTransaction } = mountManager();
    const original = applyTransaction.getMockImplementation();
    applyTransaction.mockImplementationOnce(async (name, operation) => {
      const body = records.get("body");
      if (!body) throw new Error("Missing body");
      body.snapshot.text = { initialAttributedTexts: { text: { "0": "" } } };
      await original?.(name, operation);
    });
    await expect(callMainWorld("insert-heading-spacing", { recordId: "heading" })).resolves.toBeNull();
    expect(root.children).toHaveLength(4);
  });
});
