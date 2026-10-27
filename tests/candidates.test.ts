import { describe, expect, it } from "vitest";

import { scanLoadedCandidates } from "../src/lark/candidates";

describe("scanLoadedCandidates", () => {
  it("discovers embedded sheets without reading text from their canvas", () => {
    document.body.innerHTML = '<div data-block-type="sheet" data-record-id="sheet-1"><canvas></canvas></div>';
    expect(scanLoadedCandidates(document, 480)).toEqual([expect.objectContaining({
      id: "sheet:sheet-1", recordId: "sheet-1", kind: "sheet", scrollTop: 480,
    })]);
  });
  it("extracts a Lark table header preview and stable record id", () => {
    document.body.innerHTML = `
      <div data-block-type="table" data-block-id="66" data-record-id="table-record">
        <table>
          <tr class="docx-table-tr first-row" data-index="0">
            <td data-block-type="table_cell">\u200BIdentity\u200B</td>
            <td data-block-type="table_cell">Lifecycle</td>
            <td data-block-type="table_cell">Purpose</td>
          </tr>
          <tr data-index="1"><td>Owner</td><td>Session</td><td>Isolation</td></tr>
        </table>
      </div>`;

    expect(scanLoadedCandidates(document, 1_200)).toEqual([
      {
        blockId: "66",
        headerPreview: "Identity | Lifecycle | Purpose",
        id: "table:table-record",
        kind: "table",
        recordId: "table-record",
        scrollTop: 1_200,
      },
    ]);
  });

  it("extracts Mermaid source from Lark ace lines without toolbar text", () => {
    document.body.innerHTML = `
      <div data-block-type="code" data-block-id="65" data-record-id="code-record">
        <div class="code-toolbar">代码块 Plain Text 自动换行 复制</div>
        <div class="code-block-caption"><div class="ace-line">代码块</div></div>
        <div class="code-block-zone-container">
          <div class="ace-line">\u200B%%{init: {"theme":"base"}}%%\u200B</div>
          <div class="ace-line">flowchart LR</div>
          <div class="ace-line">  A --&gt; B</div>
        </div>
      </div>`;

    expect(scanLoadedCandidates(document, 480)).toEqual([
      {
        blockId: "65",
        id: "mermaid:code-record",
        kind: "mermaid",
        preview: '%%{init: {"theme":"base"}}%%',
        recordId: "code-record",
        scrollTop: 480,
        signature: "init",
        source: '%%{init: {"theme":"base"}}%%\nflowchart LR\n  A --> B',
      },
    ]);
  });

  it("ignores ordinary code blocks and blocks without a stable id", () => {
    document.body.innerHTML = `
      <div data-block-type="code" data-record-id="ordinary-code">
        <div class="ace-line">const chartType = "flowchart";</div>
      </div>
      <div data-block-type="code">
        <div class="ace-line">flowchart LR</div>
      </div>`;

    expect(scanLoadedCandidates(document, 0)).toEqual([]);
  });

  it("returns table and Mermaid candidates in document order", () => {
    document.body.innerHTML = `
      <div data-block-type="table" data-record-id="first-table">
        <table><tr data-index="0"><td>Header</td></tr></table>
      </div>
      <div data-block-type="code" data-record-id="second-code">
        <div class="ace-line">sequenceDiagram</div>
      </div>`;

    expect(scanLoadedCandidates(document, 100).map(({ id }) => id)).toEqual([
      "table:first-table",
      "mermaid:second-code",
    ]);
  });
});
