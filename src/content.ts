import type {
  MermaidCandidate,
  RepairCandidate,
  TableCandidate,
} from "./lark/candidates";
import {
  repairDiagrams,
  requestDiagramFrameAccess,
} from "./lark/diagram-repair";
import {
  type CodeRecordSource,
  findDocumentScrollContainer,
  findLarkEditorRoot,
  scanEntireDocument,
} from "./lark/document-scanner";
import { callMainWorld } from "./lark/main-bridge";
import { repairTableHeader } from "./lark/table-repair";
import { createRepairPanel, type RepairPanel } from "./ui/panel";

const ROOT_ID = "lark-markdown-repair-root";

const COPY = {
  en: {
    cancelled: "Stopped. The original content was preserved.",
    done: (succeeded: number, failed: number) =>
      failed === 0
        ? `Repaired ${succeeded} item(s).`
        : `Repaired ${succeeded} item(s); ${failed} item(s) need manual review.`,
    editorMissing: "Lark editor not found. Confirm that you can edit this document.",
    failed: (message: string) => `Repair failed: ${message}`,
    locateFailed: "The block could not be mounted. Scan the document again.",
    located: "Moved to the selected block.",
    repairingTables: (current: number, total: number) =>
      `Bolding table headers (${current}/${total})…`,
    scanDone: (count: number) => `Found ${count} item(s) to review.`,
    scanning: "Scanning the entire document…",
  },
  zh: {
    cancelled: "已停止，原始内容已保留。",
    done: (succeeded: number, failed: number) =>
      failed === 0
        ? `已修复 ${succeeded} 项。`
        : `已修复 ${succeeded} 项，另有 ${failed} 项需要手动检查。`,
    editorMissing: "未找到 Lark 编辑器，请确认你有编辑权限并已进入编辑模式。",
    failed: (message: string) => `修复失败：${message}`,
    locateFailed: "未能加载对应区块，请重新扫描文档。",
    located: "已定位到所选区块。",
    repairingTables: (current: number, total: number) =>
      `正在加粗表格标题行（${current}/${total}）…`,
    scanDone: (count: number) => `发现 ${count} 个待确认项目。`,
    scanning: "正在扫描整篇文档…",
  },
};

type Copy = (typeof COPY)[keyof typeof COPY];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function readFullCodeSources(
  recordIds: string[],
): Promise<CodeRecordSource[]> {
  const sources: CodeRecordSource[] = [];
  for (let index = 0; index < recordIds.length; index += 100) {
    sources.push(
      ...await callMainWorld<CodeRecordSource[]>("read-code-records", {
        recordIds: recordIds.slice(index, index + 100),
      }),
    );
  }
  return sources;
}

function findEditButton(): HTMLElement | null {
  return (
    Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"]'),
    ).find((element) => {
      const label = (
        element.getAttribute("aria-label") ??
        element.textContent ??
        ""
      ).trim();
      return label === "编辑" || /^edit$/iu.test(label);
    }) ?? null
  );
}

async function ensureEditor(copy: Copy): Promise<{
  editorRoot: HTMLElement;
  scrollContainer: HTMLElement;
}> {
  let editorRoot = findLarkEditorRoot();
  if (!editorRoot) {
    findEditButton()?.click();
    for (let attempt = 0; attempt < 40 && !editorRoot; attempt += 1) {
      await wait(100);
      editorRoot = findLarkEditorRoot();
    }
  }
  if (!editorRoot) throw new Error(copy.editorMissing);

  const scrollContainer = findDocumentScrollContainer(editorRoot);
  if (!scrollContainer) throw new Error(copy.editorMissing);
  return { editorRoot, scrollContainer };
}

function startExtension(): void {
  const existingRoot = document.getElementById(ROOT_ID);
  if (existingRoot) {
    existingRoot.dispatchEvent(new CustomEvent("lark-markdown-repair:open"));
    return;
  }

  const copy = COPY[
    navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
  ];
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("data-extension-version", chrome.runtime.getManifest().version);
  document.documentElement.append(root);

  let activeController: AbortController | null = null;
  let panel: RepairPanel;

  const stop = (): void => {
    activeController?.abort();
    activeController = null;
    panel.setBusy(false);
    panel.setStatus(copy.cancelled, "warning");
  };

  const scan = async (): Promise<void> => {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    panel.setBusy(true);
    panel.setProgress(0);
    panel.setStatus(copy.scanning);
    try {
      const { editorRoot, scrollContainer } = await ensureEditor(copy);
      const candidates = await scanEntireDocument({
        editorRoot,
        onProgress: (progress) => panel.setProgress(progress),
        resolveCodeSources: readFullCodeSources,
        scrollContainer,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      panel.renderCandidates(candidates);
      panel.setProgress(1);
      panel.setStatus(copy.scanDone(candidates.length), "success");
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      panel.setStatus(copy.failed(errorMessage(error)), "error");
    } finally {
      if (activeController === controller) {
        activeController = null;
        panel.setBusy(false);
      }
    }
  };

  const repair = async (): Promise<void> => {
    const selected = panel.selectedCandidates();
    if (selected.length === 0) {
      await scan();
      return;
    }

    const hasDiagrams = selected.some(({ kind }) => kind === "mermaid");
    let frameAccessGranted = false;
    if (hasDiagrams) {
      try {
        await requestDiagramFrameAccess();
        frameAccessGranted = true;
      } catch (error: unknown) {
        panel.setStatus(copy.failed(errorMessage(error)), "error");
        return;
      }
    }

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    panel.setBusy(true);
    panel.setProgress(0);

    let succeeded = 0;
    let failed = 0;
    const failedCandidates: RepairCandidate[] = [];
    let scrollContainer: HTMLElement | null = null;
    let originalScrollTop = 0;
    try {
      const editor = await ensureEditor(copy);
      scrollContainer = editor.scrollContainer;
      originalScrollTop = scrollContainer.scrollTop;
      const tables = selected.filter(
        (candidate): candidate is TableCandidate => candidate.kind === "table",
      );
      const diagrams = selected.filter(
        (candidate): candidate is MermaidCandidate =>
          candidate.kind === "mermaid",
      );

      for (const [index, table] of tables.entries()) {
        if (controller.signal.aborted) throw new Error(copy.cancelled);
        panel.setStatus(copy.repairingTables(index + 1, tables.length));
        panel.setProgress((index + 0.5) / selected.length);
        try {
          await repairTableHeader(table, scrollContainer);
          succeeded += 1;
        } catch {
          failed += 1;
          failedCandidates.push(table);
        }
      }

      if (diagrams.length > 0) {
        const result = await repairDiagrams({
          candidates: diagrams,
          frameAccessGranted,
          onProgress: (message, progress) => {
            panel.setStatus(message);
            panel.setProgress(
              (tables.length + progress * diagrams.length) / selected.length,
            );
          },
          scrollContainer,
          signal: controller.signal,
        });
        succeeded += result.succeeded.length;
        failed += result.failed.length;
        failedCandidates.push(...result.failed.map(({ candidate }) => candidate));
      }

      panel.renderCandidates(failedCandidates);
      panel.setProgress(1);
      panel.setStatus(
        copy.done(succeeded, failed),
        failed === 0 ? "success" : "warning",
      );
    } catch (error: unknown) {
      panel.renderCandidates([]);
      panel.setStatus(
        controller.signal.aborted
          ? copy.cancelled
          : copy.failed(errorMessage(error)),
        controller.signal.aborted ? "warning" : "error",
      );
    } finally {
      if (scrollContainer) scrollContainer.scrollTop = originalScrollTop;
      if (activeController === controller) activeController = null;
      panel.setBusy(false);
    }
  };

  const navigateToCandidate = async (
    candidate: RepairCandidate,
  ): Promise<void> => {
    try {
      const { scrollContainer } = await ensureEditor(copy);
      const positions = [
        candidate.scrollTop,
        candidate.scrollTop - scrollContainer.clientHeight / 2,
        candidate.scrollTop + scrollContainer.clientHeight / 2,
      ];
      let block: HTMLElement | null = null;
      for (const position of positions) {
        scrollContainer.scrollTop = Math.max(0, position);
        await wait(120);
        block = document.querySelector<HTMLElement>(
          `[data-record-id="${CSS.escape(candidate.recordId)}"]`,
        );
        if (block) break;
      }
      if (!block) {
        panel.setStatus(copy.locateFailed, "warning");
        return;
      }
      block.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        block.animate(
          [
            { boxShadow: "0 0 0 3px rgba(79, 70, 229, .55)" },
            { boxShadow: "0 0 0 0 rgba(79, 70, 229, 0)" },
          ],
          { duration: 1_100, easing: "ease-out" },
        );
      }
      panel.setStatus(copy.located, "success");
    } catch (error: unknown) {
      panel.setStatus(copy.failed(errorMessage(error)), "error");
    }
  };

  panel = createRepairPanel({
    onCancel: stop,
    onClose: () => {
      activeController?.abort();
      panel.destroy();
    },
    onNavigate: (candidate) => void navigateToCandidate(candidate),
    onRepair: () => void repair(),
    onRescan: () => void scan(),
    root,
  });
  root.addEventListener("lark-markdown-repair:open", () => {
    root.style.display = "block";
    void scan();
  });
  void scan();
}

startExtension();
