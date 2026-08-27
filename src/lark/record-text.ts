const MAX_CODE_SOURCE_LENGTH = 1_000_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readCodeRecordSource(snapshot: unknown): string {
  if (!isObject(snapshot) || snapshot.type !== "code") {
    throw new Error("记录不是代码块");
  }
  const text = snapshot.text;
  if (!isObject(text) || !isObject(text.initialAttributedTexts)) {
    throw new Error("代码块文本结构无效");
  }
  const zones = text.initialAttributedTexts.text;
  if (!isObject(zones)) throw new Error("代码块文本结构无效");

  const orderedKeys = Object.keys(zones).sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
  });
  const parts = orderedKeys.map((key) => zones[key]);
  if (parts.length === 0 || parts.some((part) => typeof part !== "string")) {
    throw new Error("代码块文本结构无效");
  }
  const source = (parts as string[]).join("\n");
  if (source.length === 0 || source.length > MAX_CODE_SOURCE_LENGTH) {
    throw new Error("代码块源码为空或超过安全长度");
  }
  return source;
}
