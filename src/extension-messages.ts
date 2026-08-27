export interface DiagramFrameItem {
  channel: string;
  source: string;
}

export type ExtensionRequest =
  | { type: "request-drawing-frame-access" }
  | { items: DiagramFrameItem[]; type: "write-diagram-frames" }
  | { channels: string[]; type: "validate-diagram-frames" };

const MAX_BATCH_SIZE = 100;
const MAX_SOURCE_LENGTH = 1_000_000;
const MAX_TOTAL_SOURCE_LENGTH = 5_000_000;
const CHANNEL_PATTERN = /^[a-zA-Z0-9._:-]{1,200}$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChannel(value: unknown): value is string {
  return typeof value === "string" && CHANNEL_PATTERN.test(value);
}

export function parseExtensionRequest(value: unknown): ExtensionRequest | null {
  if (!isObject(value) || typeof value.type !== "string") return null;
  if (value.type === "request-drawing-frame-access") {
    return { type: value.type };
  }
  if (value.type === "write-diagram-frames" && Array.isArray(value.items)) {
    if (value.items.length === 0 || value.items.length > MAX_BATCH_SIZE) {
      return null;
    }
    const items = value.items.flatMap((item) => {
      if (
        !isObject(item) ||
        !isChannel(item.channel) ||
        typeof item.source !== "string" ||
        item.source.length === 0 ||
        item.source.length > MAX_SOURCE_LENGTH
      ) {
        return [];
      }
      return [{ channel: item.channel, source: item.source }];
    });
    const totalLength = items.reduce((sum, { source }) => sum + source.length, 0);
    if (
      items.length === value.items.length &&
      totalLength <= MAX_TOTAL_SOURCE_LENGTH
    ) {
      return { items, type: value.type };
    }
  }
  if (
    value.type === "validate-diagram-frames" &&
    Array.isArray(value.channels) &&
    value.channels.length > 0 &&
    value.channels.length <= MAX_BATCH_SIZE &&
    value.channels.every(isChannel) &&
    new Set(value.channels).size === value.channels.length
  ) {
    return { channels: value.channels as string[], type: value.type };
  }
  return null;
}
