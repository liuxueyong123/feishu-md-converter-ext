import {
  type CodeBlockReference,
  type RepairCandidate,
  createMermaidCandidate,
  scanLoadedCandidates,
  scanLoadedCodeReferences,
} from "./candidates";

export interface CodeRecordSource {
  recordId: string;
  source: string;
}

interface ScanEntireDocumentOptions {
  editorRoot: ParentNode;
  onProgress?: (progress: number) => void;
  resolveCodeSources?: (
    recordIds: string[],
  ) => Promise<CodeRecordSource[]>;
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
  scrollContainer,
  settle = waitForVirtualizedContent,
  signal,
}: ScanEntireDocumentOptions): Promise<RepairCandidate[]> {
  const originalScrollTop = scrollContainer.scrollTop;
  const candidates = new Map<string, RepairCandidate>();
  const codeReferences = new Map<string, CodeBlockReference>();
  const maximumScrollTop = Math.max(
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

      for (const candidate of scanLoadedCandidates(
        editorRoot,
        targetScrollTop,
      )) {
        if (!candidates.has(candidate.id)) {
          candidates.set(candidate.id, candidate);
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

    return Array.from(candidates.values());
  } finally {
    scrollContainer.scrollTop = originalScrollTop;
  }
}
