const ZERO_WIDTH_CHARACTERS = /[\u200B\u200C\u200D\u2060\uFEFF]/gu;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isEmptyTextParagraph(snapshot: unknown): boolean {
  if (!isObject(snapshot) || snapshot.type !== "text") return false;
  const text = snapshot.text;
  const attributed = isObject(text) ? text.initialAttributedTexts : null;
  const zones = isObject(attributed) ? attributed.text : null;
  return isObject(zones) && typeof zones["0"] === "string" &&
    zones["0"].replace(ZERO_WIDTH_CHARACTERS, "").trim().length === 0 &&
    (!Array.isArray(snapshot.children) || snapshot.children.length === 0);
}

export function needsHeadingSpacing(
  snapshot: unknown,
  previousSnapshot: unknown,
  index: number,
): boolean {
  if (
    !isObject(snapshot) ||
    typeof snapshot.type !== "string" ||
    !/^heading[123]$/u.test(snapshot.type) ||
    index === 0
  ) return false;

  if (!isObject(previousSnapshot) || typeof previousSnapshot.type !== "string") {
    throw new Error("找不到标题前的区块记录，请重新扫描文档");
  }
  if (/^heading[1-9]$/u.test(previousSnapshot.type)) return false;
  if (previousSnapshot.type !== "text") return true;

  const text = previousSnapshot.text;
  const attributed = isObject(text) ? text.initialAttributedTexts : null;
  const zones = isObject(attributed) ? attributed.text : null;
  if (!isObject(zones) || typeof zones["0"] !== "string") {
    throw new Error("标题前的段落文本结构无效，请重新扫描文档");
  }
  return !isEmptyTextParagraph(previousSnapshot);
}
