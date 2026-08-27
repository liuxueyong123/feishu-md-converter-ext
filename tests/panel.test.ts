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
      onNavigate: vi.fn(),
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

  it("navigates from the candidate body without changing selection", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onNavigate = vi.fn();
    const panel = createRepairPanel({
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onNavigate,
      onRepair: vi.fn(),
      onRescan: vi.fn(),
      root,
    });
    const candidate = {
      blockId: "12",
      headerPreview: "Identity | Lifecycle",
      id: "table:table-1",
      kind: "table" as const,
      recordId: "table-1",
      scrollTop: 900,
    };

    panel.renderCandidates([candidate]);
    panel.setBusy(false);
    root.shadowRoot
      ?.querySelector<HTMLButtonElement>(".candidate-link")
      ?.click();

    expect(onNavigate).toHaveBeenCalledWith(candidate);
    expect(panel.selectedCandidates()).toEqual([candidate]);
  });
});
