import { describe, expect, it } from "vitest";

import { needsHeadingSpacing } from "../src/lark/heading-spacing";

function textSnapshot(value: string): Record<string, unknown> {
  return {
    type: "text",
    children: [],
    text: { initialAttributedTexts: { text: { "0": value } } },
  };
}

describe("needsHeadingSpacing", () => {
  it.each(["heading1", "heading2", "heading3"])(
    "adds a blank before %s following nonempty text",
    (type) => {
      expect(needsHeadingSpacing({ type }, textSnapshot("正文"), 1)).toBe(true);
    },
  );

  it.each(["table", "bullet", "ordered", "code", "isv"])(
    "adds a blank after a %s block",
    (type) => {
      expect(needsHeadingSpacing({ type: "heading2" }, { type }, 3)).toBe(true);
    },
  );

  it("skips the first block and headings outside H1–H3", () => {
    expect(needsHeadingSpacing({ type: "heading1" }, undefined, 0)).toBe(false);
    expect(needsHeadingSpacing({ type: "heading4" }, textSnapshot("正文"), 1)).toBe(false);
  });

  it.each(["heading1", "heading2", "heading3", "heading6", "heading9"])(
    "keeps adjacent headings together after %s",
    (type) => {
      expect(needsHeadingSpacing({ type: "heading3" }, { type }, 1)).toBe(false);
    },
  );

  it.each(["", " \n\t", "\u200B\u200C\u200D\u2060\uFEFF"])(
    "preserves an existing blank paragraph %j",
    (text) => {
      expect(needsHeadingSpacing({ type: "heading2" }, textSnapshot(text), 1)).toBe(false);
    },
  );

  it("does not treat a paragraph with nested content as blank", () => {
    const previous = { ...textSnapshot(""), children: ["nested-block"] };
    expect(needsHeadingSpacing({ type: "heading2" }, previous, 1)).toBe(true);
  });

  it("rejects unavailable or malformed previous text instead of guessing", () => {
    expect(() => needsHeadingSpacing({ type: "heading2" }, undefined, 1)).toThrow();
    expect(() => needsHeadingSpacing({ type: "heading2" }, { type: "text" }, 1)).toThrow();
  });
});
