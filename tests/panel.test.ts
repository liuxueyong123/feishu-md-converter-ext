import { describe, expect, it, vi } from "vitest";

import { createRepairPanel } from "../src/ui/panel";

describe("createRepairPanel", () => {
  it("routes the empty-state primary action to a single rescan", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onRepair = vi.fn();
    const onRescan = vi.fn();
    const panel = createRepairPanel({
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onRepair,
      onRescan,
      root,
    });

    panel.renderCandidates([]);
    panel.setBusy(false);
    root.shadowRoot
      ?.querySelector<HTMLButtonElement>("button.primary")
      ?.click();

    expect(onRescan).toHaveBeenCalledTimes(1);
    expect(onRepair).not.toHaveBeenCalled();
  });
});
