import type { MermaidCandidate } from "./candidates";
import { callMainWorld, type CreatedDiagram } from "./main-bridge";

interface FrameAccessResponse {
  granted: boolean;
}

interface RuntimeResponse<T> {
  error?: string;
  ok: boolean;
  result?: T;
}

interface DiagramFrameItem {
  channel: string;
  source: string;
}

interface FrameValidation {
  channel: string;
  chartOnly: boolean;
  error: boolean;
  valid: boolean;
}

export interface DiagramRepairResult {
  failed: Array<{ candidate: MermaidCandidate; reason: string }>;
  succeeded: MermaidCandidate[];
}

interface RepairDiagramsOptions {
  candidates: MermaidCandidate[];
  frameAccessGranted?: boolean;
  onProgress?: (message: string, progress: number) => void;
  scrollContainer: HTMLElement;
  signal?: AbortSignal;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("处理已停止");
  }
}

async function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  const response: RuntimeResponse<T> | undefined =
    await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? "扩展后台操作失败");
  }
  return response.result as T;
}

async function rollbackCreatedDiagrams(
  created: CreatedDiagram[],
): Promise<void> {
  if (created.length === 0) return;
  await callMainWorld<string[]>("delete-records", {
    recordIds: created.flatMap(({ diagramRecordId, trailingTextRecordId }) => [
      diagramRecordId,
      trailingTextRecordId,
    ]),
  });
}

export async function requestDiagramFrameAccess(): Promise<void> {
  const response = await sendRuntimeMessage<FrameAccessResponse>({
    type: "request-drawing-frame-access",
  });
  if (!response.granted) {
    throw new Error("未授予文本绘图组件访问权限");
  }
}

async function collectFrameChannels(
  created: CreatedDiagram[],
  scrollContainer: HTMLElement,
  onProgress: RepairDiagramsOptions["onProgress"],
  signal: AbortSignal | undefined,
): Promise<Map<string, string>> {
  const pending = new Set(created.map(({ diagramRecordId }) => diagramRecordId));
  const channels = new Map<string, string>();

  for (let pass = 0; pass < 2 && pending.size > 0; pass += 1) {
    const maximumScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
    );
    const step = Math.max(320, scrollContainer.clientHeight);
    for (let scrollTop = 0; scrollTop <= maximumScrollTop; scrollTop += step) {
      throwIfCancelled(signal);
      scrollContainer.scrollTop = Math.min(scrollTop, maximumScrollTop);
      await wait(100);
      for (const recordId of Array.from(pending)) {
        const iframe = document.querySelector<HTMLIFrameElement>(
          `[data-record-id="${CSS.escape(recordId)}"] iframe[channel]`,
        );
        const channel = iframe?.getAttribute("channel");
        if (channel) {
          channels.set(recordId, channel);
          pending.delete(recordId);
        }
      }
      onProgress?.(
        "等待文本绘图组件加载",
        created.length === 0 ? 1 : channels.size / created.length,
      );
      if (pending.size === 0 || scrollTop >= maximumScrollTop) {
        break;
      }
    }
    if (pending.size > 0) {
      await wait(800);
    }
  }

  return channels;
}

async function validateFrames(
  channels: string[],
  signal: AbortSignal | undefined,
): Promise<Map<string, FrameValidation>> {
  const validations = new Map<string, FrameValidation>();
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && validations.size < channels.length) {
    throwIfCancelled(signal);
    const current = await sendRuntimeMessage<FrameValidation[]>({
      channels,
      type: "validate-diagram-frames",
    });
    for (const validation of current) {
      if (validation.valid && validation.chartOnly) {
        validations.set(validation.channel, validation);
      }
    }
    if (validations.size < channels.length) {
      await wait(500);
    }
  }
  return validations;
}

export async function repairDiagrams({
  candidates,
  frameAccessGranted = false,
  onProgress,
  scrollContainer,
  signal,
}: RepairDiagramsOptions): Promise<DiagramRepairResult> {
  if (candidates.length === 0) {
    return { failed: [], succeeded: [] };
  }
  throwIfCancelled(signal);
  if (!frameAccessGranted) await requestDiagramFrameAccess();
  onProgress?.("创建文本绘图组件", 0.05);

  const created = await callMainWorld<CreatedDiagram[]>("create-diagrams", {
    targets: candidates.map(({ recordId }) => ({ recordId })),
  });
  let migrationClassified = false;
  try {
    const createdBySource = new Map(
      created.map((item) => [item.sourceRecordId, item]),
    );
    const channels = await collectFrameChannels(
      created,
      scrollContainer,
      onProgress,
      signal,
    );

    const frameItems: DiagramFrameItem[] = [];
    for (const candidate of candidates) {
      const item = createdBySource.get(candidate.recordId);
      const channel = item && channels.get(item.diagramRecordId);
      if (channel) {
        frameItems.push({ channel, source: candidate.source });
      }
    }
    if (frameItems.length > 0) {
      onProgress?.("写入 Mermaid 源码", 0.72);
      await sendRuntimeMessage({ items: frameItems, type: "write-diagram-frames" });
    }
    const validations = await validateFrames(
      frameItems.map(({ channel }) => channel),
      signal,
    );

    const succeeded: MermaidCandidate[] = [];
    const failed: Array<{ candidate: MermaidCandidate; reason: string }> = [];
    const sourcesToDelete: string[] = [];
    const rollbackRecords: string[] = [];

    for (const candidate of candidates) {
      const item = createdBySource.get(candidate.recordId);
      const channel = item && channels.get(item.diagramRecordId);
      if (item && channel && validations.has(channel)) {
        succeeded.push(candidate);
        sourcesToDelete.push(candidate.recordId);
      } else {
        failed.push({
          candidate,
          reason: channel ? "图表渲染或展示模式校验失败" : "组件加载超时",
        });
        if (item) {
          rollbackRecords.push(item.diagramRecordId, item.trailingTextRecordId);
        }
      }
    }

    if (rollbackRecords.length > 0) {
      await callMainWorld<string[]>("delete-records", {
        recordIds: rollbackRecords,
      });
    }
    migrationClassified = true;

    if (sourcesToDelete.length > 0) {
      onProgress?.("移除已迁移的 Mermaid 代码块", 0.94);
      await callMainWorld<string[]>("delete-records", {
        recordIds: sourcesToDelete,
      });
    }
    onProgress?.("Mermaid 迁移完成", 1);
    return { failed, succeeded };
  } catch (error: unknown) {
    if (!migrationClassified) {
      try {
        await rollbackCreatedDiagrams(created);
      } catch (rollbackError: unknown) {
        const message = rollbackError instanceof Error
          ? rollbackError.message
          : "未知错误";
        throw new Error(
          `${error instanceof Error ? error.message : "Mermaid 迁移失败"}；新建组件回滚失败：${message}`,
        );
      }
    }
    throw error;
  }
}
