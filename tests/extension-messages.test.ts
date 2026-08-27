import { describe, expect, it } from "vitest";

import { parseExtensionRequest } from "../src/extension-messages";

describe("parseExtensionRequest", () => {
  it("accepts a bounded diagram write request", () => {
    expect(
      parseExtensionRequest({
        items: [{ channel: "frame-1", source: "flowchart LR\nA-->B" }],
        type: "write-diagram-frames",
      }),
    ).toEqual({
      items: [{ channel: "frame-1", source: "flowchart LR\nA-->B" }],
      type: "write-diagram-frames",
    });
  });

  it("rejects malformed channels and oversized sources", () => {
    expect(
      parseExtensionRequest({
        items: [{ channel: "frame\n1", source: "flowchart LR" }],
        type: "write-diagram-frames",
      }),
    ).toBeNull();
    expect(
      parseExtensionRequest({
        items: [{ channel: "frame-1", source: "x".repeat(1_000_001) }],
        type: "write-diagram-frames",
      }),
    ).toBeNull();
  });

  it("rejects duplicate validation channels", () => {
    expect(
      parseExtensionRequest({
        channels: ["frame-1", "frame-1"],
        type: "validate-diagram-frames",
      }),
    ).toBeNull();
  });
});
