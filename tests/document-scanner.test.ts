import { describe, expect, it, vi } from "vitest";

import { scanEntireDocument } from "../src/lark/document-scanner";

function defineScrollMetrics(
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number },
): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
  });
}

describe("scanEntireDocument", () => {
  it("collects virtualized candidates, deduplicates them, and restores position", async () => {
    const scrollContainer = document.createElement("div");
    const editorRoot = document.createElement("main");
    scrollContainer.append(editorRoot);
    document.body.append(scrollContainer);
    defineScrollMetrics(scrollContainer, {
      clientHeight: 500,
      scrollHeight: 1_500,
    });
    scrollContainer.scrollTop = 350;

    const settle = vi.fn(async () => {
      if (scrollContainer.scrollTop < 500) {
        editorRoot.innerHTML = `
          <div data-block-type="table" data-record-id="table-1">
            <table><tr data-index="0"><td>First table</td></tr></table>
          </div>`;
      } else if (scrollContainer.scrollTop < 1_000) {
        editorRoot.innerHTML = `
          <div data-block-type="table" data-record-id="table-1">
            <table><tr data-index="0"><td>First table</td></tr></table>
          </div>
          <div data-block-type="code" data-record-id="diagram-1">
            <div class="ace-line">flowchart LR</div>
          </div>`;
      } else {
        editorRoot.innerHTML = `
          <div data-block-type="table" data-record-id="table-2">
            <table><tr data-index="0"><td>Last table</td></tr></table>
          </div>`;
      }
    });
    const onProgress = vi.fn();

    const candidates = await scanEntireDocument({
      editorRoot,
      onProgress,
      scrollContainer,
      settle,
    });

    expect(candidates.map(({ id }) => id)).toEqual([
      "table:table-1",
      "mermaid:diagram-1",
      "table:table-2",
    ]);
    expect(candidates.map(({ scrollTop }) => scrollTop)).toEqual([0, 500, 1_000]);
    expect(scrollContainer.scrollTop).toBe(350);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it("restores the original position when scanning is cancelled", async () => {
    const scrollContainer = document.createElement("div");
    const editorRoot = document.createElement("main");
    scrollContainer.append(editorRoot);
    defineScrollMetrics(scrollContainer, {
      clientHeight: 400,
      scrollHeight: 1_600,
    });
    scrollContainer.scrollTop = 275;
    const abortController = new AbortController();

    await expect(
      scanEntireDocument({
        editorRoot,
        scrollContainer,
        settle: async () => {
          abortController.abort();
        },
        signal: abortController.signal,
      }),
    ).rejects.toThrow("扫描已停止");
    expect(scrollContainer.scrollTop).toBe(275);
  });
});
