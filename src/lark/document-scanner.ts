import {
  type BlockReference,
  type RepairCandidate,
  type SheetCandidate,
  createMermaidCandidate,
  scanLoadedCandidates,
  scanLoadedCodeReferences,
  scanLoadedHeadingReferences,
} from "./candidates";

export interface CodeRecordSource {
  recordId: string;
  source: string;
}

export interface HeadingSpacingRecord {
  recordId: string;
  preview: string;
}

export interface SheetTablePreview {
  recordId: string;
  preview: string;
  unsupportedReason?: string;
}

interface ScanEntireDocumentOptions {
  editorRoot: ParentNode;
  onProgress?: (progress: number) => void;
  resolveCodeSources?: (
    recordIds: string[],
  ) => Promise<CodeRecordSource[]>;
  resolveHeadingSpacing?: (recordIds: string[]) => Promise<HeadingSpacingRecord[]>;
  resolveSheetTables?: (recordIds: string[]) => Promise<SheetTablePreview[]>;
  scrollContainer: HTMLElement;
  settle?: () => Promise<void>;
  signal?: AbortSignal;
}

const MAX_SCAN_STEPS = 2_000;

function waitForVirtualizedContent(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 40);
      });
    });
  });
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("扫描已停止");
  }
}

export function findLarkEditorRoot(
  documentRoot: Document = document,
): HTMLElement | null {
  return documentRoot.querySelector<HTMLElement>(
    '#docx [data-block-type="page"], #docx .page-block.root-block',
  );
}

export function findDocumentScrollContainer(
  editorRoot: HTMLElement,
): HTMLElement | null {
  let element: HTMLElement | null = editorRoot;

  while (element) {
    if (element.scrollHeight > element.clientHeight + 100) {
      const overflowY = window.getComputedStyle(element).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        return element;
      }
    }
    element = element.parentElement;
  }

  return null;
}

export async function scanEntireDocument({
  editorRoot,
  onProgress,
  resolveCodeSources,
  resolveHeadingSpacing,
  resolveSheetTables,
  scrollContainer,
  settle = waitForVirtualizedContent,
  signal,
}: ScanEntireDocumentOptions): Promise<RepairCandidate[]> {
  const originalScrollTop = scrollContainer.scrollTop;
  const candidates = new Map<string, RepairCandidate>();
  const codeReferences = new Map<string, BlockReference>();
  const headingReferences = new Map<string, BlockReference>();
  let maximumScrollTop = Math.max(
    0,
    scrollContainer.scrollHeight - scrollContainer.clientHeight,
  );
  const scrollStep = Math.max(240, scrollContainer.clientHeight * 0.5);

  try {
    let reachedDocumentEnd = false;
    for (let step = 0; step < MAX_SCAN_STEPS; step += 1) {
      throwIfCancelled(signal);
      const targetScrollTop = Math.min(step * scrollStep, maximumScrollTop);
      scrollContainer.scrollTop = targetScrollTop;
      await settle();
      throwIfCancelled(signal);
      maximumScrollTop = Math.max(
        0,
        scrollContainer.scrollHeight - scrollContainer.clientHeight,
      );

      const loadedCandidates = scanLoadedCandidates(
        editorRoot,
        targetScrollTop,
      );
      for (const candidate of loadedCandidates) {
        if (!candidates.has(candidate.id)) {
          candidates.set(candidate.id, candidate);
        }
      }
      const loadedSheets = loadedCandidates.filter((candidate): candidate is SheetCandidate => candidate.kind === "sheet");
      if (resolveSheetTables && loadedSheets.length > 0) {
        const previews = await resolveSheetTables(loadedSheets.map(({ recordId }) => recordId));
        throwIfCancelled(signal);
        for (const preview of previews) {
          const reference = candidates.get(`sheet:${preview.recordId}`);
          if (reference?.kind === "sheet") {
            candidates.set(reference.id, { ...reference, unsupportedReason: undefined, ...preview });
          }
        }
      }
      for (const reference of scanLoadedCodeReferences(
        editorRoot,
        targetScrollTop,
      )) {
        if (!codeReferences.has(reference.recordId)) {
          codeReferences.set(reference.recordId, reference);
        }
      }
      for (const reference of scanLoadedHeadingReferences(editorRoot, targetScrollTop)) {
        if (!headingReferences.has(reference.recordId)) {
          headingReferences.set(reference.recordId, reference);
        }
      }

      onProgress?.(
        maximumScrollTop === 0 ? 1 : targetScrollTop / maximumScrollTop,
      );

      if (targetScrollTop >= maximumScrollTop) {
        reachedDocumentEnd = true;
        break;
      }
    }

    if (!reachedDocumentEnd) {
      throw new Error("文档过长，扫描未能在安全步数内完成");
    }

    if (resolveCodeSources && codeReferences.size > 0) {
      throwIfCancelled(signal);
      for (const { recordId } of codeReferences.values()) {
        candidates.delete(`mermaid:${recordId}`);
      }
      const resolved = await resolveCodeSources(Array.from(codeReferences.keys()));
      throwIfCancelled(signal);
      for (const { recordId, source } of resolved) {
        const reference = codeReferences.get(recordId);
        if (!reference) continue;
        const candidate = createMermaidCandidate(reference, source);
        if (candidate) candidates.set(candidate.id, candidate);
      }
    }

    if (resolveHeadingSpacing && headingReferences.size > 0) {
      throwIfCancelled(signal);
      const resolved = await resolveHeadingSpacing(Array.from(headingReferences.keys()));
      throwIfCancelled(signal);
      for (const { recordId, preview } of resolved) {
        const reference = headingReferences.get(recordId);
        if (!reference) continue;
        candidates.set(`heading:${recordId}`, {
          ...reference, id: `heading:${recordId}`, kind: "heading", preview,
        });
      }
    }

    return Array.from(candidates.values());
  } finally {
    scrollContainer.scrollTop = originalScrollTop;
  }
}
