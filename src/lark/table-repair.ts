import type { TableCandidate } from "./candidates";
import { callMainWorld } from "./main-bridge";

const ZERO_WIDTH_CHARACTERS = /[\u200B\u200C\u200D\u2060\uFEFF]/gu;

interface TextRecordTarget {
  recordId: string;
  textLength: number;
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => window.setTimeout(resolve, 100));
  });
}

function isTextLeafBold(element: Element): boolean {
  if (element.closest("b, strong")) return true;
  const weight = window.getComputedStyle(element).fontWeight;
  return weight === "bold" || Number.parseInt(weight, 10) >= 600;
}

function textBlockIsBold(textBlock: Element): boolean {
  const leaves = Array.from(
    textBlock.querySelectorAll('[data-string="true"], [data-leaf="true"]'),
  ).filter((element) =>
    Boolean(
      (element.textContent ?? "").replace(ZERO_WIDTH_CHARACTERS, "").trim(),
    ),
  );
  return leaves.length === 0 || leaves.every(isTextLeafBold);
}

function findFirstRow(table: Element): Element | null {
  return table.querySelector("tr.first-row, tr[data-index='0'], table tr");
}

function collectUnboldTextRecords(firstRow: Element): TextRecordTarget[] {
  return Array.from(
    firstRow.querySelectorAll<HTMLElement>(
      '[data-block-type="table_cell"] [data-block-type="text"][data-record-id], td [data-block-type="text"][data-record-id], th [data-block-type="text"][data-record-id]',
    ),
  ).flatMap((textBlock) => {
    const recordId = textBlock.getAttribute("data-record-id");
    const textLength = (textBlock.textContent ?? "").replace(
      ZERO_WIDTH_CHARACTERS,
      "",
    ).length;
    if (!recordId || textLength === 0 || textBlockIsBold(textBlock)) return [];
    return [{ recordId, textLength }];
  });
}

async function locateTable(
  candidate: TableCandidate,
  scrollContainer: HTMLElement,
): Promise<Element | null> {
  const positions = [
    candidate.scrollTop,
    candidate.scrollTop - scrollContainer.clientHeight / 2,
    candidate.scrollTop + scrollContainer.clientHeight / 2,
  ];
  for (const position of positions) {
    scrollContainer.scrollTop = Math.max(0, position);
    await settle();
    const table = document.querySelector(
      `[data-block-type="table"][data-record-id="${CSS.escape(candidate.recordId)}"]`,
    );
    if (table) return table;
  }
  return null;
}

export async function repairTableHeader(
  candidate: TableCandidate,
  scrollContainer: HTMLElement,
): Promise<void> {
  const table = await locateTable(candidate, scrollContainer);
  if (!table) throw new Error("滚动后仍未找到表格");

  const firstRow = findFirstRow(table);
  if (!firstRow) throw new Error("未找到表格标题行");
  const targets = collectUnboldTextRecords(firstRow);
  if (targets.length === 0) return;

  await callMainWorld<string[]>("bold-text-records", { records: targets });
  await settle();
  const remaining = collectUnboldTextRecords(firstRow);
  if (remaining.length > 0) throw new Error("表头加粗结果校验失败");
}
