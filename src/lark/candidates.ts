import { detectMermaidSource } from "../core/mermaid";

interface CandidateBase {
  blockId: string | null;
  id: string;
  recordId: string;
  scrollTop: number;
}

export interface BlockReference {
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

export interface HeadingCandidate extends CandidateBase {
  kind: "heading";
  preview: string;
}

export interface SheetCandidate extends CandidateBase {
  kind: "sheet";
  preview: string;
  unsupportedReason?: string;
}

export type RepairCandidate = TableCandidate | MermaidCandidate | HeadingCandidate | SheetCandidate;

const LARK_BLOCK_SELECTOR =
  '[data-block-type="table"], [data-block-type="code"], [data-block-type="sheet"]';
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
  reference: BlockReference,
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
): BlockReference[] {
  return Array.from(
    root.querySelectorAll('[data-block-type="code"][data-record-id]'),
  ).flatMap((block) => {
    const identity = readStableBlockIdentity(block);
    return identity ? [{ ...identity, scrollTop }] : [];
  });
}

export function scanLoadedHeadingReferences(
  root: ParentNode,
  scrollTop: number,
): BlockReference[] {
  return Array.from(root.querySelectorAll(
    '[data-block-type="heading1"], [data-block-type="heading2"], [data-block-type="heading3"]',
  )).flatMap((block) => {
    const identity = readStableBlockIdentity(block);
    return identity ? [{ ...identity, scrollTop }] : [];
  });
}

export function scanLoadedCandidates(
  root: ParentNode,
  scrollTop: number,
): RepairCandidate[] {
  return Array.from(root.querySelectorAll(LARK_BLOCK_SELECTOR)).flatMap<RepairCandidate>(
    (block) => {
      const blockType = block.getAttribute("data-block-type");
      if (blockType === "sheet") {
        const identity = readStableBlockIdentity(block);
        return identity ? [{ ...identity, scrollTop, id: `sheet:${identity.recordId}`, kind: "sheet" as const, preview: "", unsupportedReason: "电子表格尚未读取，请重新扫描" }] : [];
      }
      const candidate =
        blockType === "table"
          ? readTableCandidate(block, scrollTop)
          : readMermaidCandidate(block, scrollTop);
      return candidate ? [candidate] : [];
    },
  );
}
