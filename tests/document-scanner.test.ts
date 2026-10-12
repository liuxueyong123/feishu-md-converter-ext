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
  it("resolves virtualized headings from native predecessors and keeps their scroll positions", async () => {
    const scrollContainer = document.createElement("div");
    const editorRoot = document.createElement("main");
    scrollContainer.append(editorRoot);
    defineScrollMetrics(scrollContainer, { clientHeight: 500, scrollHeight: 1_500 });
    scrollContainer.scrollTop = 125;
    const resolveHeadingSpacing = vi.fn(async () => [
      { recordId: "last-heading", preview: "完整标题" },
    ]);
    const candidates = await scanEntireDocument({
      editorRoot,
      scrollContainer,
      resolveHeadingSpacing,
      settle: async () => {
        editorRoot.innerHTML = scrollContainer.scrollTop < 500
          ? '<div data-block-type="heading1" data-record-id="first-heading">开头标题</div>'
          : '<div data-block-type="heading3" data-block-id="9" data-record-id="last-heading">标题 DOM 片段</div>';
      },
    });
    expect(resolveHeadingSpacing).toHaveBeenCalledWith(["first-heading", "last-heading"]);
    expect(candidates).toEqual([{
      blockId: "9", id: "heading:last-heading", kind: "heading",
      preview: "完整标题", recordId: "last-heading", scrollTop: 500,
    }]);
    expect(scrollContainer.scrollTop).toBe(125);
  });

  it("continues scanning when lazy rendering increases the document height", async () => {
    const scrollContainer = document.createElement("div");
    const editorRoot = document.createElement("main");
    scrollContainer.append(editorRoot);
    defineScrollMetrics(scrollContainer, { clientHeight: 500, scrollHeight: 500 });
    const candidates = await scanEntireDocument({
      editorRoot,
      scrollContainer,
      settle: async () => {
        defineScrollMetrics(scrollContainer, { clientHeight: 500, scrollHeight: 1_500 });
        editorRoot.innerHTML = scrollContainer.scrollTop === 1_000
          ? '<div data-block-type="table" data-record-id="last"><table><tr><td>Last</td></tr></table></div>'
          : "";
      },
    });
    expect(candidates.map(({ id }) => id)).toEqual(["table:last"]);
  });

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

  it("uses the full Lark record when a long code block DOM is virtualized", async () => {
    const scrollContainer = document.createElement("div");
    const editorRoot = document.createElement("main");
    scrollContainer.append(editorRoot);
    document.body.append(scrollContainer);
    defineScrollMetrics(scrollContainer, {
      clientHeight: 500,
      scrollHeight: 500,
    });
    editorRoot.innerHTML = `
      <div data-block-type="code" data-block-id="12" data-record-id="long-code">
        <div class="code-block-zone-container">
          <div class="ace-line">participant S as Controller</div>
          <div class="ace-line">S-->>C: middle fragment only</div>
        </div>
      </div>`;
    const resolveCodeSources = vi.fn(async () => [
      {
        recordId: "long-code",
        source: "%%{init: {\"theme\":\"base\"}}%%\nsequenceDiagram\nC->>S: complete source",
      },
    ]);

    const candidates = await scanEntireDocument({
      editorRoot,
      resolveCodeSources,
      scrollContainer,
      settle: async () => undefined,
    });

    expect(resolveCodeSources).toHaveBeenCalledWith(["long-code"]);
    expect(candidates).toEqual([
      expect.objectContaining({
        id: "mermaid:long-code",
        signature: "init",
        source:
          "%%{init: {\"theme\":\"base\"}}%%\nsequenceDiagram\nC->>S: complete source",
      }),
    ]);
  });
});
