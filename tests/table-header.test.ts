import { describe, expect, it } from "vitest";

import { createTableHeaderPlan } from "../src/lark/table-header";

function tableSnapshot(): Record<string, unknown> {
  return {
    type: "table",
    rows_id: ["row-1", "row-2"],
    columns_id: ["col-1", "col-2"],
    cell_set: {
      "row-1col-1": { block_id: "cell-1" },
      "row-1col-2": { block_id: "cell-2" },
      "row-2col-1": { block_id: "body-cell" },
    },
  };
}

describe("createTableHeaderPlan", () => {
  it("formats every header cell including empty cells using complete record text", () => {
    const records: Record<string, unknown> = {
      "cell-1": { type: "table_cell", children: ["text-1"] },
      "cell-2": { type: "table_cell", children: ["empty-text"] },
      "text-1": {
        type: "text",
        text: { initialAttributedTexts: { text: { "0": "Full header\u200B" } } },
      },
      "empty-text": {
        type: "text",
        text: { initialAttributedTexts: { text: { "0": "" } } },
      },
    };

    const plan = createTableHeaderPlan(tableSnapshot(), (id) => records[id]);

    expect(plan.cellRecordIds).toEqual(["cell-1", "cell-2"]);
    expect(plan.textEdits).toHaveLength(1);
    expect(plan.textEdits[0]).toMatchObject({
      recordId: "text-1",
      changeset: { zone_changesets: { "0": "Z:c>0*0=c$" } },
    });
  });

  it("deduplicates merged cells and does not format the second row", () => {
    const table = tableSnapshot();
    table.cell_set = {
      "row-1col-1": { block_id: "merged" },
      "row-1col-2": { block_id: "merged" },
      "row-2col-1": { block_id: "body-cell" },
    };

    expect(createTableHeaderPlan(table, () => ({
      type: "table_cell", children: [],
    }))).toEqual({ cellRecordIds: ["merged"], textEdits: [] });
  });

  it("rejects incomplete table or text records before applying any formatting", () => {
    expect(() => createTableHeaderPlan({ type: "table" }, () => undefined)).toThrow();
    expect(() => createTableHeaderPlan(tableSnapshot(), () => undefined)).toThrow();
    expect(() => createTableHeaderPlan(tableSnapshot(), (id) =>
      id === "invalid-text"
        ? { type: "text" }
        : { type: "table_cell", children: ["invalid-text"] },
    )).toThrow();
  });
});
