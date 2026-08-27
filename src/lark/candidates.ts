import { detectMermaidSource } from "../core/mermaid";

interface CandidateBase {
  blockId: string | null;
  id: string;
  recordId: string;
  scrollTop: number;
}

export interface CodeBlockReference {
  blockId: string | null;
  recordId: string;
  scrollTop: number;
}

export interface TableCandidate extends CandidateBase {
  headerPreview: string;
  kind: "table";
}

export interface MermaidCandidate extends CandidateBase {
  kind: "mermaid";
  preview: string;
  signature: string;
  source: string;
}

export type RepairCandidate = TableCandidate | MermaidCandidate;

const LARK_BLOCK_SELECTOR =
  '[data-block-type="table"], [data-block-type="code"]';
const ZERO_WIDTH_CHARACTERS = /[\u200B\u200C\u200D\u2060\uFEFF]/gu;

function readStableBlockIdentity(block: Element): {
  blockId: string | null;
  recordId: string;
} | null {
  const blockId = block.getAttribute("data-block-id");
  const recordId = block.getAttribute("data-record-id");

  if (!recordId) {
    return null;
  }

  return { blockId, recordId };
}

function cleanPreviewText(text: string): string {
  return text
    .replace(ZERO_WIDTH_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readTableCandidate(
  block: Element,
  scrollTop: number,
): TableCandidate | null {
  const identity = readStableBlockIdentity(block);
  if (!identity) {
    return null;
  }

  const firstRow = block.querySelector(
    "tr.first-row, tr[data-index='0'], table tr",
  );
  if (!firstRow) {
    return null;
  }

  const headerPreview = Array.from(
    firstRow.querySelectorAll('[data-block-type="table_cell"], td, th'),
  )
    .map((cell) => cleanPreviewText(cell.textContent ?? ""))
    .filter(Boolean)
    .join(" | ");

  return {
    ...identity,
    headerPreview: headerPreview || "空标题行",
    id: `table:${identity.recordId}`,
    kind: "table",
    scrollTop,
  };
}

function readCodeSource(block: Element): string {
  const codeZone = block.querySelector(".code-block-zone-container");
  const codeLines = Array.from(
    (codeZone ?? block).querySelectorAll(".ace-line"),
  ).filter(
    (line) =>
      !line.closest(".code-block-caption, .caption-editor, .code-toolbar"),
  );
  if (codeLines.length > 0) {
    return codeLines.map((line) => line.textContent ?? "").join("\n");
  }

  return (
    block.querySelector(".code-block-zone-container")?.textContent ?? ""
  );
}

export function createMermaidCandidate(
  reference: CodeBlockReference,
  source: string,
): MermaidCandidate | null {
  const detection = detectMermaidSource(source);
  if (!detection.isMermaid || !detection.signature) {
    return null;
  }

  const [firstLine = "Mermaid"] = detection.normalizedSource.split("\n");
  return {
    ...reference,
    id: `mermaid:${reference.recordId}`,
    kind: "mermaid",
    preview: firstLine.slice(0, 120),
    signature: detection.signature,
    source: detection.normalizedSource,
  };
}

function readMermaidCandidate(
  block: Element,
  scrollTop: number,
): MermaidCandidate | null {
  const identity = readStableBlockIdentity(block);
  if (!identity) return null;
  return createMermaidCandidate(
    { ...identity, scrollTop },
    readCodeSource(block),
  );
}

export function scanLoadedCodeReferences(
  root: ParentNode,
  scrollTop: number,
): CodeBlockReference[] {
  return Array.from(
    root.querySelectorAll('[data-block-type="code"][data-record-id]'),
  ).flatMap((block) => {
    const identity = readStableBlockIdentity(block);
    return identity ? [{ ...identity, scrollTop }] : [];
  });
}

export function scanLoadedCandidates(
  root: ParentNode,
  scrollTop: number,
): RepairCandidate[] {
  return Array.from(root.querySelectorAll(LARK_BLOCK_SELECTOR)).flatMap(
    (block) => {
      const blockType = block.getAttribute("data-block-type");
      const candidate =
        blockType === "table"
          ? readTableCandidate(block, scrollTop)
          : readMermaidCandidate(block, scrollTop);
      return candidate ? [candidate] : [];
    },
  );
}
