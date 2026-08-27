import type { MermaidCandidate } from "../src/lark/candidates";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMainWorldMock } = vi.hoisted(() => ({
  callMainWorldMock: vi.fn(),
}));

vi.mock("../src/lark/main-bridge", () => ({
  callMainWorld: callMainWorldMock,
}));

import { repairDiagrams } from "../src/lark/diagram-repair";

const CANDIDATE: MermaidCandidate = {
  blockId: "block-1",
  id: "mermaid:source-1",
  kind: "mermaid",
  preview: "flowchart LR",
  recordId: "source-1",
  scrollTop: 0,
  signature: "flowchart",
  source: "flowchart LR\nA --> B",
};

describe("repairDiagrams", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    callMainWorldMock.mockReset();
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          sendMessage: vi.fn(async (message: { type: string }) => {
            if (message.type === "request-drawing-frame-access") {
              return { ok: true, result: { granted: true } };
            }
            return { error: "写入失败", ok: false };
          }),
        },
      },
    });
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { escape: (value: string) => value },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("rolls back every newly created record when frame writing fails", async () => {
    callMainWorldMock
      .mockResolvedValueOnce([
        {
          diagramRecordId: "diagram-1",
          sourceRecordId: "source-1",
          trailingTextRecordId: "text-1",
        },
      ])
      .mockResolvedValueOnce(["diagram-1", "text-1"]);
    document.body.innerHTML = `
      <div data-record-id="diagram-1"><iframe channel="channel-1"></iframe></div>
    `;
    const scrollContainer = document.createElement("div");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 600 },
    });

    const promise = repairDiagrams({
      candidates: [CANDIDATE],
      scrollContainer,
    });
    const rejection = expect(promise).rejects.toThrow("写入失败");
    await vi.advanceTimersByTimeAsync(150);

    await rejection;
    expect(callMainWorldMock).toHaveBeenLastCalledWith("delete-records", {
      recordIds: ["diagram-1", "text-1"],
    });
  });

  it("focuses a lazy iframe and retries when the batch write misses it", async () => {
    callMainWorldMock
      .mockResolvedValueOnce([
        {
          diagramRecordId: "diagram-1",
          sourceRecordId: "source-1",
          trailingTextRecordId: "text-1",
        },
      ])
      .mockResolvedValueOnce(["source-1"]);
    let writeAttempts = 0;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      async (message: unknown) => {
        const request = message as { type: string };
        if (request.type === "request-drawing-frame-access") {
          return { ok: true, result: { granted: true } };
        }
        if (request.type === "write-diagram-frames") {
          writeAttempts += 1;
          return {
            ok: true,
            result:
              writeAttempts === 1
                ? []
                : [
                    {
                      frameId: 2,
                      result: { channel: "channel-1", written: true },
                    },
                  ],
          };
        }
        return {
          ok: true,
          result: [
            {
              channel: "channel-1",
              chartOnly: true,
              error: false,
              valid: true,
            },
          ],
        };
      },
    );
    document.body.innerHTML = `
      <div data-record-id="diagram-1"><iframe channel="channel-1"></iframe></div>
    `;
    const scrollContainer = document.createElement("div");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 600 },
    });

    const promise = repairDiagrams({
      candidates: [CANDIDATE],
      scrollContainer,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(writeAttempts).toBe(2);
    expect(result).toEqual({ failed: [], succeeded: [CANDIDATE] });
    expect(callMainWorldMock).toHaveBeenLastCalledWith("delete-records", {
      recordIds: ["source-1"],
    });
  });
});
