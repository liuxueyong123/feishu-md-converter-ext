import { describe, expect, it, vi } from "vitest";

import { callMainWorld } from "../src/lark/main-bridge";

describe("callMainWorld", () => {
  it("uses the versioned bridge channel and resolves its response", async () => {
    const dispatch = vi.spyOn(document, "dispatchEvent");
    const promise = callMainWorld<{ ok: boolean }>(
      "read-code-records",
      { recordIds: ["code-1"] },
    );
    const requestEvent = dispatch.mock.calls[0]?.[0];
    expect(requestEvent).toBeInstanceOf(CustomEvent);
    const detail = JSON.parse(
      (requestEvent as CustomEvent<string>).detail,
    ) as { id: string };
    expect((requestEvent as CustomEvent<string>).type).toBe(
      "lark-markdown-repair:main-request:v2",
    );

    document.dispatchEvent(
      new CustomEvent("lark-markdown-repair:main-response:v2", {
        detail: JSON.stringify({ id: detail.id, result: { ok: true } }),
      }),
    );

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("includes the command in timeout diagnostics", async () => {
    vi.useFakeTimers();
    const promise = callMainWorld("create-diagrams", { targets: [] }, 500);
    const rejection = expect(promise).rejects.toThrow(
      "create-diagrams：等待 Lark 编辑器响应超时",
    );
    await vi.advanceTimersByTimeAsync(500);
    await rejection;
    vi.useRealTimers();
  });
});
