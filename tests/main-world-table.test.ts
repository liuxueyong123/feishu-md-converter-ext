import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { callMainWorld } from "../src/lark/main-bridge";
import { TABLE_HEADER_BACKGROUND } from "../src/lark/table-header";

describe("native table header transaction", () => {
  beforeAll(async () => {
    await import("../src/main-world");
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function mountManager(): {
    records: Record<string, { snapshot: Record<string, unknown> }>;
    edit: ReturnType<typeof vi.fn>;
  } {
    const records = {
      table: { snapshot: {
        type: "table", rows_id: ["r"], columns_id: ["a", "b"],
        cell_set: { ra: { block_id: "cell-a" }, rb: { block_id: "cell-b" } },
      } },
      "cell-a": { snapshot: { type: "table_cell", children: ["text"] } },
      "cell-b": { snapshot: { type: "table_cell", children: [] } },
      text: { snapshot: {
        type: "text", text: { initialAttributedTexts: { text: { "0": "Header" } } },
      } },
    } satisfies Record<string, { snapshot: Record<string, unknown> }>;
    const recordMap: Record<string, { snapshot: Record<string, unknown> }> = records;
    const edit = vi.fn();
    const manager = {
      getRecord: (id: string) => recordMap[id],
      getBlockStructsByRecordId: () => [],
      applyTransaction: async (
        _name: string,
        operation: (transaction: unknown) => void,
      ) => {
        await Promise.resolve();
        operation({
          edit,
          replace: (id: string, path: string[], value: unknown) => {
            recordMap[id].snapshot[path[0]] = value;
          },
        });
      },
    };
    const node = document.createElement("div");
    node.dataset.blockType = "page";
    Object.assign(node, {
      __reactFiber$test: {
        memoizedProps: { block: { blockManager: manager, record: { id: "root" } } },
      },
    });
    document.body.append(node);
    return { records: recordMap, edit };
  }

  it("persists native background on empty and unmounted cells with text bolding", async () => {
    const { records, edit } = mountManager();
    await expect(callMainWorld("format-table-header", {
      recordId: "table",
    })).resolves.toEqual(["cell-a", "cell-b"]);

    expect(records["cell-a"].snapshot.background_color).toBe(TABLE_HEADER_BACKGROUND);
    expect(records["cell-b"].snapshot.background_color).toBe(TABLE_HEADER_BACKGROUND);
    expect(edit).toHaveBeenCalledWith("text", ["text"], expect.objectContaining({
      zone_changesets: { "0": "Z:6>0*0=6$" },
    }));
  });

  it("rejects missing records before altering any cells", async () => {
    const { records, edit } = mountManager();
    delete records["cell-b"];
    await expect(callMainWorld("format-table-header", {
      recordId: "table",
    })).rejects.toThrow("找不到表头单元格");
    expect(records["cell-a"].snapshot.background_color).toBeUndefined();
    expect(edit).not.toHaveBeenCalled();
  });
});
