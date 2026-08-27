import { describe, expect, it } from "vitest";

import { readCodeRecordSource } from "../src/lark/record-text";

describe("readCodeRecordSource", () => {
  it("reads the complete source from Lark attributed text zones", () => {
    expect(
      readCodeRecordSource({
        text: {
          initialAttributedTexts: {
            text: {
              "1": "A->>B: done",
              "0": "sequenceDiagram",
            },
          },
        },
        type: "code",
      }),
    ).toBe("sequenceDiagram\nA->>B: done");
  });

  it("rejects non-code records and oversized sources", () => {
    expect(() => readCodeRecordSource({ type: "text" })).toThrow(
      "不是代码块",
    );
    expect(() =>
      readCodeRecordSource({
        text: {
          initialAttributedTexts: { text: { "0": "x".repeat(1_000_001) } },
        },
        type: "code",
      }),
    ).toThrow("超过安全长度");
  });
});
