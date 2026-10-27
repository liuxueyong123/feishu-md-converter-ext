import { describe, expect, it, vi } from "vitest";

import { createRepairPanel } from "../src/ui/panel";

describe("createRepairPanel", () => {
  it("allows selecting convertible sheets and keeps unsupported sheets disabled with reasons", () => {
    const root = document.createElement("div");
    const panel = createRepairPanel({
      onCancel: vi.fn(), onClose: vi.fn(), onNavigate: vi.fn(),
      onRepair: vi.fn(), onRescan: vi.fn(), onStart: vi.fn(), root,
    });
    const ready = { blockId: null, recordId: "ready", id: "sheet:ready", kind: "sheet" as const, preview: "7 × 3 · 标题", scrollTop: 0 };
    const unsupported = { ...ready, id: "sheet:formula", recordId: "formula", unsupportedReason: "含公式，已保留原表" };
    panel.renderCandidates([ready, unsupported]);
    panel.setBusy(true);
    panel.setBusy(false);
    expect(panel.selectedCandidates()).toEqual([ready]);
    const inputs = root.shadowRoot!.querySelectorAll<HTMLInputElement>("input");
    expect(inputs[0]!.disabled).toBe(false);
    expect(inputs[1]!.disabled).toBe(true);
    expect(root.shadowRoot!.textContent).toContain("含公式，已保留原表");
    panel.renderCandidates([unsupported]);
    expect(root.shadowRoot!.querySelector<HTMLButtonElement>(".primary")!.disabled).toBe(true);
  });
  it("previews heading spacing with its own label and supports choosing the repair", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onRepair = vi.fn();
    const panel = createRepairPanel({
      onCancel: vi.fn(), onClose: vi.fn(), onNavigate: vi.fn(),
      onRepair, onRescan: vi.fn(), onStart: vi.fn(), root,
    });
    const candidate = {
      blockId: null, id: "heading:heading-1", kind: "heading" as const,
      preview: "章节标题", recordId: "heading-1", scrollTop: 100,
    };
    panel.renderCandidates([candidate]);
    expect(["标题前补空行", "Add blank line before heading"]).toContain(
      root.shadowRoot?.querySelector(".candidate-title")?.textContent,
    );
    expect(root.shadowRoot?.querySelector(".candidate-preview")?.textContent).toBe("章节标题");
    expect(panel.selectedCandidates()).toEqual([candidate]);
    const input = root.shadowRoot?.querySelector<HTMLInputElement>("input");
    input?.click();
    expect(panel.selectedCandidates()).toEqual([]);
    expect(root.shadowRoot?.querySelector<HTMLButtonElement>("button.primary")?.disabled).toBe(true);
    input?.click();
    root.shadowRoot?.querySelector<HTMLButtonElement>("button.primary")?.click();
    expect(onRepair).toHaveBeenCalledOnce();
    panel.destroy();
  });

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

  it("hides the completed action and keeps rescan available", () => {
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
    expect(primary?.hidden).toBe(true);
    primary?.click();
    expect(onRescan).not.toHaveBeenCalled();

    root.shadowRoot
      ?.querySelector<HTMLButtonElement>(".footer button:not(.primary)")
      ?.click();
    expect(onRescan).toHaveBeenCalledTimes(1);
  });
});
