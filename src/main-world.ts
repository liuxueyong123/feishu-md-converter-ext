import {
  createDiagramRecord,
  createEmptyTextRecord,
  planDiagramInsertions,
} from "./lark/insertion-plan";
import { createBoldTextEdit } from "./lark/text-format";
import { readCodeRecordSource } from "./lark/record-text";
import { isEmptyTextParagraph, needsHeadingSpacing } from "./lark/heading-spacing";
import {
  createTableHeaderPlan,
  TABLE_HEADER_BACKGROUND,
} from "./lark/table-header";

const REQUEST_EVENT = "lark-markdown-repair:main-request:v2";
const RESPONSE_EVENT = "lark-markdown-repair:main-response:v2";
const INSTALL_FLAG = "__larkMarkdownRepairMainWorldInstalledV2";
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
  replace(recordId: string, path: readonly string[], value: unknown): void;
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
  trailingTextRecordId: string | null;
}

interface BridgeRequest {
  command:
    | "bold-text-records"
    | "format-table-header"
    | "read-heading-spacing"
    | "insert-heading-spacing"
    | "create-diagrams"
    | "delete-records"
    | "read-code-records";
  id: string;
  recordId?: string;
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
    __larkMarkdownRepairMainWorldInstalledV2?: boolean;
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

async function formatTableHeader(recordIdValue: unknown): Promise<string[]> {
  if (!isRecordId(recordIdValue)) throw new Error("表格记录 ID 无效");
  const blockManager = requireBlockManager();
  const plan = createTableHeaderPlan(
    blockManager.getRecord(recordIdValue)?.snapshot,
    (recordId) => blockManager.getRecord(recordId)?.snapshot,
  );
  await blockManager.applyTransaction(
    "lark-markdown-repair:format-table-header",
    (transaction) => {
      for (const cellRecordId of plan.cellRecordIds) {
        transaction.replace(
          cellRecordId,
          ["background_color"],
          TABLE_HEADER_BACKGROUND,
        );
      }
      for (const edit of plan.textEdits) {
        transaction.edit(edit.recordId, ["text"], edit.changeset);
      }
    },
    { source: "local-insert" },
  );
  for (const cellRecordId of plan.cellRecordIds) {
    if (
      blockManager.getRecord(cellRecordId)?.snapshot?.background_color !==
      TABLE_HEADER_BACKGROUND
    ) {
      throw new Error("表头底色保存结果校验失败");
    }
  }
  return plan.cellRecordIds;
}

function resolveHeadingSpacing(
  blockManager: LarkBlockManager,
  recordId: string,
): { parentRecordId: string; index: number; author: string; preview: string; needsBlank: boolean } {
  const struct = blockManager.getBlockStructsByRecordId(recordId)[0];
  const parent = struct?.parent;
  const snapshot = blockManager.getRecord(recordId)?.snapshot;
  if (!struct || !parent || !snapshot || !/^heading[123]$/u.test(snapshot.type ?? "")) {
    throw new Error(`找不到 H1–H3 标题记录：${recordId}`);
  }
  const index = parent.children.findIndex((child) => child.id === struct.id);
  if (index < 0) throw new Error(`无法定位标题顺序：${recordId}`);
  const previous = index > 0
    ? blockManager.getRecord(parent.children[index - 1].record.id)?.snapshot
    : undefined;
  const text = snapshot.text;
  const attributed = isObject(text) ? text.initialAttributedTexts : null;
  const zones = isObject(attributed) ? attributed.text : null;
  return {
    parentRecordId: parent.record.id,
    index,
    author: typeof snapshot.author === "string" ? snapshot.author : "",
    preview: isObject(zones) && typeof zones["0"] === "string" ? zones["0"].slice(0, 120) : "",
    needsBlank: needsHeadingSpacing(snapshot, previous, index),
  };
}

function readHeadingSpacing(recordIdsValue: unknown): Array<{ recordId: string; preview: string }> {
  const recordIds = validateRecordIds(recordIdsValue);
  if (recordIds.length === 0 || recordIds.length > MAX_BATCH_SIZE) {
    throw new Error("待读取标题数据无效");
  }
  const blockManager = requireBlockManager();
  return recordIds.flatMap((recordId) => {
    const heading = resolveHeadingSpacing(blockManager, recordId);
    return heading.needsBlank ? [{ recordId, preview: heading.preview }] : [];
  });
}

async function insertHeadingSpacing(recordIdValue: unknown): Promise<string | null> {
  if (!isRecordId(recordIdValue)) throw new Error("标题记录 ID 无效");
  const blockManager = requireBlockManager();
  const heading = resolveHeadingSpacing(blockManager, recordIdValue);
  if (!heading.needsBlank) return null;
  let createdRecordId: string | null = null;
  await blockManager.applyTransaction(
    "lark-markdown-repair:insert-heading-spacing",
    (transaction) => {
      const currentHeading = resolveHeadingSpacing(blockManager, recordIdValue);
      if (!currentHeading.needsBlank) return;
      const recordIds = transaction.createChildren(
        [createEmptyTextRecord(currentHeading.parentRecordId, currentHeading.author)],
        null,
      );
      if (recordIds.length !== 1 || !recordIds[0]) {
        throw new Error("Lark 未返回新建空段落的记录 ID");
      }
      createdRecordId = recordIds[0];
      transaction.insertChildren(currentHeading.parentRecordId, currentHeading.index, recordIds);
    },
    { source: "local-insert" },
  );
  if (createdRecordId === null) return null;
  const current = blockManager.getBlockStructsByRecordId(recordIdValue)[0];
  const index = current?.parent?.children.findIndex((child) => child.id === current.id) ?? -1;
  if (
    index <= 0 ||
    current?.parent?.children[index - 1].record.id !== createdRecordId ||
    resolveHeadingSpacing(blockManager, recordIdValue).needsBlank
  ) throw new Error("标题前空段落保存结果校验失败，请重新扫描文档");
  return createdRecordId;
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
        const struct = blockManager.getBlockStructsByRecordId(insertion.sourceRecordId)[0];
        const parent = struct?.parent;
        const sourceIndex = parent?.children.findIndex((child) => child.id === struct?.id) ?? -1;
        if (!parent || sourceIndex < 0 || parent.record.id !== insertion.parentRecordId) {
          throw new Error(`Mermaid 源块位置已变化，请重新扫描文档：${insertion.sourceRecordId}`);
        }
        const next = parent.children[sourceIndex + 1];
        const needsTrailingText = !isEmptyTextParagraph(
          next ? blockManager.getRecord(next.record.id)?.snapshot : undefined,
        );
        const author =
          blockManager.getRecord(insertion.sourceRecordId)?.snapshot?.author ?? "";
        const recordIds = transaction.createChildren(
          [
            createDiagramRecord(insertion.parentRecordId, author),
            ...(needsTrailingText ? [createEmptyTextRecord(insertion.parentRecordId, author)] : []),
          ],
          null,
        );
        const [diagramRecordId, trailingTextRecordId = null] = recordIds;
        if (recordIds.length !== (needsTrailingText ? 2 : 1) || !diagramRecordId || (needsTrailingText && !trailingTextRecordId)) {
          throw new Error("Lark 未返回新建文本绘图的记录 ID");
        }
        transaction.insertChildren(
          insertion.parentRecordId,
          sourceIndex + 1,
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
        value.command !== "format-table-header" &&
        value.command !== "read-heading-spacing" &&
        value.command !== "insert-heading-spacing" &&
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
          case "format-table-header":
            result = await formatTableHeader(request.recordId);
            break;
          case "read-heading-spacing":
            result = readHeadingSpacing(request.recordIds);
            break;
          case "insert-heading-spacing":
            result = await insertHeadingSpacing(request.recordId);
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
