import { describe, expect, it } from "vitest";

import { createBoldTextEdit } from "../src/lark/text-format";

describe("createBoldTextEdit", () => {
  it("encodes the Lark text length in base 36", () => {
    expect(createBoldTextEdit("text-record", 21)).toEqual({
      changeset: {
        apool: {
          nextNum: 1,
          numToAttrib: { "0": ["bold", "true"] },
        },
        zone_changesets: { "0": "Z:l>0*0=l$" },
      },
      recordId: "text-record",
    });
  });

  it("rejects empty or unsafe text edits", () => {
    expect(() => createBoldTextEdit("", 2)).toThrow();
    expect(() => createBoldTextEdit("record", 0)).toThrow();
    expect(() => createBoldTextEdit("record", 1_000_001)).toThrow();
  });
});
