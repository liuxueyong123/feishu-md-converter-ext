import { describe, expect, it, vi } from "vitest";

const { callMainWorldMock } = vi.hoisted(() => ({ callMainWorldMock: vi.fn() }));
vi.mock("../src/lark/main-bridge", () => ({ callMainWorld: callMainWorldMock }));

import { repairTableHeader } from "../src/lark/table-repair";

describe("repairTableHeader", () => {
  it("formats the complete native header even when its DOM is unmounted", async () => {
    callMainWorldMock.mockResolvedValueOnce(["cell-1", "cell-2"]);
    await repairTableHeader({
      blockId: null,
      headerPreview: "Header",
      id: "table:table-1",
      kind: "table",
      recordId: "table-1",
      scrollTop: 500,
    });
    expect(callMainWorldMock).toHaveBeenCalledWith("format-table-header", {
      recordId: "table-1",
    });
  });
});
