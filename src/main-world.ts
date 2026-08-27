import {
  createDiagramRecord,
  createEmptyTextRecord,
  planDiagramInsertions,
} from "./lark/insertion-plan";
import { createBoldTextEdit } from "./lark/text-format";
import { readCodeRecordSource } from "./lark/record-text";

const REQUEST_EVENT = "lark-markdown-repair:main-request";
const RESPONSE_EVENT = "lark-markdown-repair:main-response";
const INSTALL_FLAG = "__larkMarkdownRepairMainWorldInstalled";
const MAX_BATCH_SIZE = 100;

interface ReactFiberLike {
  memoizedProps?: { block?: unknown };
  return?: ReactFiberLike | null;
  stateNode?: unknown;
}

interface LarkRecord {
  id: string;
  snapshot?: {
    author?: string;
    [key: string]: unknown;
    type?: string;
  };
}

interface LarkBlockStruct {
  children: LarkBlockStruct[];
  id: number;
  parent?: LarkBlockStruct | null;
  record: LarkRecord;
}

interface LarkTransaction {
  createChildren(records: readonly unknown[], anchor: null): string[];
  insertChildren(
    parentRecordId: string,
    index: number,
    recordIds: readonly string[],
  ): void;
  removeChildren(parentRecordId: string, recordIds: readonly string[]): void;
  edit(
    recordId: string,
    path: readonly string[],
    changeset: unknown,
  ): void;
}

interface LarkBlockManager {
  applyTransaction(
    name: string,
    operation: (transaction: LarkTransaction) => void,
    options?: { source?: string },
  ): Promise<void>;
  getBlockStructsByRecordId(recordId: string): LarkBlockStruct[];
  getRecord(recordId: string): LarkRecord | undefined;
}

interface BlockInstance {
  blockManager: LarkBlockManager;
  record: LarkRecord;
}

interface CreateTarget {
  recordId: string;
}

interface CreatedDiagram {
  diagramRecordId: string;
  sourceRecordId: string;
  trailingTextRecordId: string;
}

interface BridgeRequest {
  command:
    | "bold-text-records"
    | "create-diagrams"
    | "delete-records"
    | "read-code-records";
  id: string;
  records?: Array<{ recordId: string; textLength: number }>;
  recordIds?: string[];
  targets?: CreateTarget[];
}

interface BridgeResponse {
  error?: string;
  id: string;
  result?: unknown;
}

declare global {
  interface Window {
    __larkMarkdownRepairMainWorldInstalled?: boolean;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecordId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isBlockManager(value: unknown): value is LarkBlockManager {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.applyTransaction === "function" &&
    typeof value.getBlockStructsByRecordId === "function" &&
    typeof value.getRecord === "function"
  );
}

function asBlockInstance(value: unknown): BlockInstance | null {
  if (!isObject(value) || !isObject(value.record)) {
    return null;
  }
  const blockManager = value.blockManager;
  const id = value.record.id;
  if (!isBlockManager(blockManager) || typeof id !== "string") {
    return null;
  }
  return { blockManager, record: value.record as unknown as LarkRecord };
}

function reactFiberFor(element: Element): ReactFiberLike | null {
  const key = Object.keys(element).find(
    (candidate) =>
      candidate.startsWith("__reactInternalInstance$") ||
      candidate.startsWith("__reactFiber$"),
  );
  if (!key) {
    return null;
  }
  return (element as unknown as Record<string, unknown>)[key] as
    | ReactFiberLike
    | null;
}

function findBlockManager(): LarkBlockManager | null {
  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>("[data-block-type]"),
  );

  for (const block of blocks) {
    const nodes = [block, ...Array.from(block.querySelectorAll("*"))].slice(
      0,
      160,
    );
    for (const node of nodes) {
      let fiber = reactFiberFor(node);
      for (let depth = 0; fiber && depth < 30; depth += 1) {
        const candidates = [fiber.stateNode, fiber.memoizedProps?.block];
        for (const candidate of candidates) {
          const instance = asBlockInstance(candidate);
          if (instance) {
            return instance.blockManager;
          }
        }
        fiber = fiber.return ?? null;
      }
    }
  }
  return null;
}

function requireBlockManager(): LarkBlockManager {
  const blockManager = findBlockManager();
  if (!blockManager) {
    throw new Error("无法连接 Lark 编辑器，请确认文档处于编辑模式");
  }
  return blockManager;
}

function validateCreateTargets(value: unknown): CreateTarget[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("没有可创建的 Mermaid 图表");
  }
  if (value.length > MAX_BATCH_SIZE) {
    throw new Error("单次最多处理 100 个 Mermaid 图表");
  }

  const targets = value.map((candidate) => {
    if (!isObject(candidate) || !isRecordId(candidate.recordId)) {
      throw new Error("Mermaid 候选数据无效");
    }
    return { recordId: candidate.recordId };
  });
  if (new Set(targets.map(({ recordId }) => recordId)).size !== targets.length) {
    throw new Error("Mermaid 候选数据重复");
  }
  return targets;
}

function validateRecordIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_BATCH_SIZE * 2) {
    throw new Error("待删除记录数据无效");
  }
  const recordIds = value.filter(isRecordId);
  if (
    recordIds.length !== value.length ||
    new Set(recordIds).size !== recordIds.length
  ) {
    throw new Error("待删除记录数据无效");
  }
  return recordIds;
}

function validateCodeRecordIds(value: unknown): string[] {
  const recordIds = validateRecordIds(value);
  if (recordIds.length === 0 || recordIds.length > MAX_BATCH_SIZE) {
    throw new Error("待读取代码块数据无效");
  }
  return recordIds;
}

function readCodeRecords(
  recordIdsValue: unknown,
): Array<{ recordId: string; source: string }> {
  const recordIds = validateCodeRecordIds(recordIdsValue);
  const blockManager = requireBlockManager();
  return recordIds.map((recordId) => {
    const record = blockManager.getRecord(recordId);
    if (!record?.snapshot) {
      throw new Error(`找不到代码块记录：${recordId}`);
    }
    return {
      recordId,
      source: readCodeRecordSource(record.snapshot),
    };
  });
}

function validateBoldTextEdits(value: unknown): ReturnType<typeof createBoldTextEdit>[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_SIZE) {
    throw new Error("待加粗表头文本数据无效");
  }
  return value.map((item) => {
    if (
      !isObject(item) ||
      !isRecordId(item.recordId) ||
      typeof item.textLength !== "number"
    ) {
      throw new Error("待加粗表头文本数据无效");
    }
    return createBoldTextEdit(item.recordId, item.textLength);
  });
}

async function boldTextRecords(recordsValue: unknown): Promise<string[]> {
  const edits = validateBoldTextEdits(recordsValue);
  const blockManager = requireBlockManager();
  for (const { recordId } of edits) {
    if (blockManager.getRecord(recordId)?.snapshot?.type !== "text") {
      throw new Error(`找不到表头文本记录：${recordId}`);
    }
  }
  await blockManager.applyTransaction(
    "lark-markdown-repair:bold-table-header",
    (transaction) => {
      for (const edit of edits) {
        transaction.edit(edit.recordId, ["text"], edit.changeset);
      }
    },
    { source: "local-insert" },
  );
  return edits.map(({ recordId }) => recordId);
}

async function createDiagrams(targetsValue: unknown): Promise<CreatedDiagram[]> {
  const targets = validateCreateTargets(targetsValue);
  const blockManager = requireBlockManager();
  const resolved = targets.map((target) => {
    const struct = blockManager.getBlockStructsByRecordId(target.recordId)[0];
    const parent = struct?.parent;
    if (!struct || !parent) {
      throw new Error(`找不到 Mermaid 源块：${target.recordId}`);
    }
    const sourceIndex = parent.children.findIndex(
      (child) => child.id === struct.id,
    );
    if (sourceIndex < 0) {
      throw new Error(`无法定位 Mermaid 源块顺序：${target.recordId}`);
    }
    return {
      parentRecordId: parent.record.id,
      sourceIndex,
      sourceRecordId: target.recordId,
    };
  });

  const planned = planDiagramInsertions(resolved);
  const created: CreatedDiagram[] = [];

  await blockManager.applyTransaction(
    "lark-markdown-repair:create-diagrams",
    (transaction) => {
      for (const insertion of planned) {
        const author =
          blockManager.getRecord(insertion.sourceRecordId)?.snapshot?.author ?? "";
        const recordIds = transaction.createChildren(
          [
            createDiagramRecord(insertion.parentRecordId, author),
            createEmptyTextRecord(insertion.parentRecordId, author),
          ],
          null,
        );
        const [diagramRecordId, trailingTextRecordId] = recordIds;
        if (!diagramRecordId || !trailingTextRecordId) {
          throw new Error("Lark 未返回新建文本绘图的记录 ID");
        }
        transaction.insertChildren(
          insertion.parentRecordId,
          insertion.insertionIndex,
          recordIds,
        );
        created.push({
          diagramRecordId,
          sourceRecordId: insertion.sourceRecordId,
          trailingTextRecordId,
        });
      }
    },
    { source: "local-insert" },
  );

  return created;
}

async function deleteRecords(recordIdsValue: unknown): Promise<string[]> {
  const recordIds = validateRecordIds(recordIdsValue);
  if (recordIds.length === 0) {
    return [];
  }
  const blockManager = requireBlockManager();
  const byParent = new Map<string, string[]>();

  for (const recordId of recordIds) {
    const parent =
      blockManager.getBlockStructsByRecordId(recordId)[0]?.parent?.record.id;
    if (!parent) {
      continue;
    }
    const group = byParent.get(parent) ?? [];
    group.push(recordId);
    byParent.set(parent, group);
  }

  await blockManager.applyTransaction(
    "lark-markdown-repair:delete-records",
    (transaction) => {
      for (const [parentRecordId, children] of byParent) {
        transaction.removeChildren(parentRecordId, children);
      }
    },
    { source: "local-insert" },
  );
  return Array.from(byParent.values()).flat();
}

function parseRequest(detail: unknown): BridgeRequest | null {
  if (typeof detail !== "string") {
    return null;
  }
  try {
    const value: unknown = JSON.parse(detail);
    if (
      !isObject(value) ||
      typeof value.id !== "string" ||
      (value.command !== "bold-text-records" &&
        value.command !== "create-diagrams" &&
        value.command !== "delete-records" &&
        value.command !== "read-code-records")
    ) {
      return null;
    }
    return value as unknown as BridgeRequest;
  } catch {
    return null;
  }
}

function respond(response: BridgeResponse): void {
  document.dispatchEvent(
    new CustomEvent(RESPONSE_EVENT, { detail: JSON.stringify(response) }),
  );
}

if (!window[INSTALL_FLAG]) {
  window[INSTALL_FLAG] = true;
  document.addEventListener(REQUEST_EVENT, (event) => {
    const request = parseRequest((event as CustomEvent<unknown>).detail);
    if (!request) {
      return;
    }
    void (async () => {
      try {
        let result: unknown;
        switch (request.command) {
          case "bold-text-records":
            result = await boldTextRecords(request.records);
            break;
          case "create-diagrams":
            result = await createDiagrams(request.targets);
            break;
          case "delete-records":
            result = await deleteRecords(request.recordIds);
            break;
          case "read-code-records":
            result = readCodeRecords(request.recordIds);
            break;
        }
        respond({ id: request.id, result });
      } catch (error: unknown) {
        respond({
          error: error instanceof Error ? error.message : "Lark 编辑器操作失败",
          id: request.id,
        });
      }
    })();
  });
}
