import { describe, expect, it, vi } from "vitest";

import { createRepairPanel } from "../src/ui/panel";

describe("createRepairPanel", () => {
  it("waits for an explicit start action before scanning", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onStart = vi.fn();
    const panel = createRepairPanel({
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onNavigate: vi.fn(),
      onRepair: vi.fn(),
      onRescan: vi.fn(),
      onStart,
      root,
    });

    const primary = root.shadowRoot?.querySelector<HTMLButtonElement>(
      "button.primary",
    );
    expect(["开始扫描", "Start scan"]).toContain(primary?.textContent);
    expect(primary?.disabled).toBe(false);

    primary?.click();

    expect(onStart).toHaveBeenCalledTimes(1);
    panel.destroy();
  });

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
      onStart: vi.fn(),
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
      onStart: vi.fn(),
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

  it("shows a completed primary action after a successful repair", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onRescan = vi.fn();
    const panel = createRepairPanel({
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onNavigate: vi.fn(),
      onRepair: vi.fn(),
      onRescan,
      onStart: vi.fn(),
      root,
    });

    panel.renderCandidates([]);
    panel.setBusy(false);
    panel.setCompleted();

    const primary = root.shadowRoot?.querySelector<HTMLButtonElement>(
      "button.primary",
    );
    expect(["完成", "Done"]).toContain(primary?.textContent);
    expect(primary?.disabled).toBe(true);
    primary?.click();
    expect(onRescan).not.toHaveBeenCalled();
  });
});
