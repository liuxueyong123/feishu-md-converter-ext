import {
  type RepairCandidate,
  scanLoadedCandidates,
} from "./candidates";

interface ScanEntireDocumentOptions {
  editorRoot: ParentNode;
  onProgress?: (progress: number) => void;
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
  scrollContainer,
  settle = waitForVirtualizedContent,
  signal,
}: ScanEntireDocumentOptions): Promise<RepairCandidate[]> {
  const originalScrollTop = scrollContainer.scrollTop;
  const candidates = new Map<string, RepairCandidate>();
  const maximumScrollTop = Math.max(
    0,
    scrollContainer.scrollHeight - scrollContainer.clientHeight,
  );
  const scrollStep = Math.max(320, scrollContainer.clientHeight);

  try {
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

      onProgress?.(
        maximumScrollTop === 0 ? 1 : targetScrollTop / maximumScrollTop,
      );

      if (targetScrollTop >= maximumScrollTop) {
        return Array.from(candidates.values());
      }
    }

    throw new Error("文档过长，扫描未能在安全步数内完成");
  } finally {
    scrollContainer.scrollTop = originalScrollTop;
  }
}

