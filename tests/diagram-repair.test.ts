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

  it("loads a diagram at the bottom when the scroll range is shorter than one step", async () => {
    callMainWorldMock.mockResolvedValueOnce([
      {
        diagramRecordId: "diagram-1",
        sourceRecordId: "source-1",
        trailingTextRecordId: "text-1",
      },
    ]).mockResolvedValueOnce(["source-1"]);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const request = message as { type: string };
      return {
        ok: true,
        result: request.type === "write-diagram-frames"
          ? [{ frameId: 2, result: { channel: "channel-1", written: true } }]
          : [{ channel: "channel-1", chartOnly: true, error: false, valid: true }],
      };
    });
    const scrollContainer = document.createElement("div");
    let scrollTop = 0;
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 850 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
          if (value === 250) {
            document.body.innerHTML = '<div data-record-id="diagram-1"><iframe channel="channel-1"></iframe></div>';
          }
        },
      },
    });

    const promise = repairDiagrams({ candidates: [CANDIDATE], frameAccessGranted: true, scrollContainer });
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ failed: [], succeeded: [CANDIDATE] });
    expect(callMainWorldMock).toHaveBeenLastCalledWith("delete-records", { recordIds: ["source-1"] });
  });

  it("waits for a slow render without restarting it by rewriting the source", async () => {
    callMainWorldMock.mockResolvedValueOnce([
      {
        diagramRecordId: "diagram-1",
        sourceRecordId: "source-1",
        trailingTextRecordId: "text-1",
      },
    ]).mockResolvedValueOnce(["source-1"]);
    let renderReadyAt = Number.POSITIVE_INFINITY;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const request = message as { type: string };
      if (request.type === "write-diagram-frames") {
        renderReadyAt = Date.now() + 4_500;
        return { ok: true, result: [{ frameId: 2, result: { channel: "channel-1", written: true } }] };
      }
      return {
        ok: true,
        result: [{ channel: "channel-1", chartOnly: true, error: false, valid: Date.now() >= renderReadyAt }],
      };
    });
    document.body.innerHTML = '<div data-record-id="diagram-1"><iframe channel="channel-1"></iframe></div>';
    const scrollContainer = document.createElement("div");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 600 },
    });

    const promise = repairDiagrams({ candidates: [CANDIDATE], frameAccessGranted: true, scrollContainer });
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ failed: [], succeeded: [CANDIDATE] });
    expect(callMainWorldMock).toHaveBeenLastCalledWith("delete-records", { recordIds: ["source-1"] });
  });

  it("finds the current iframe when focusing remounts the diagram element", async () => {
    callMainWorldMock.mockResolvedValueOnce([
      {
        diagramRecordId: "diagram-1",
        sourceRecordId: "source-1",
        trailingTextRecordId: "text-1",
      },
    ]).mockResolvedValueOnce(["source-1"]);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const request = message as { type: string };
      return {
        ok: true,
        result: request.type === "write-diagram-frames"
          ? [{ frameId: 2, result: { channel: "channel-2", written: true } }]
          : [{ channel: "channel-2", chartOnly: true, error: false, valid: true }],
      };
    });
    document.body.innerHTML = '<div data-record-id="diagram-1"></div>';
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockImplementationOnce(() => {
      document.body.innerHTML = '<div data-record-id="diagram-1"><iframe channel="channel-2"></iframe></div>';
    });
    const scrollContainer = document.createElement("div");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 600 },
    });

    const promise = repairDiagrams({ candidates: [CANDIDATE], frameAccessGranted: true, scrollContainer });
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ failed: [], succeeded: [CANDIDATE] });
    expect(callMainWorldMock).toHaveBeenLastCalledWith("delete-records", { recordIds: ["source-1"] });
  });

  it("resends once after a full render window when the first posted write was ignored", async () => {
    callMainWorldMock.mockResolvedValueOnce([
      {
        diagramRecordId: "diagram-1",
        sourceRecordId: "source-1",
        trailingTextRecordId: "text-1",
      },
    ]).mockResolvedValueOnce(["source-1"]);
    let writeAttempts = 0;
    let renderReadyAt = Number.POSITIVE_INFINITY;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const request = message as { type: string };
      if (request.type === "write-diagram-frames") {
        writeAttempts += 1;
        if (writeAttempts > 1) renderReadyAt = Date.now() + 5_800;
        return { ok: true, result: [{ frameId: 2, result: { channel: "channel-1", written: true } }] };
      }
      return {
        ok: true,
        result: [{ channel: "channel-1", chartOnly: true, error: false, valid: Date.now() >= renderReadyAt }],
      };
    });
    document.body.innerHTML = '<div data-record-id="diagram-1"><iframe channel="channel-1"></iframe></div>';
    const scrollContainer = document.createElement("div");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 600 },
    });

    const promise = repairDiagrams({ candidates: [CANDIDATE], frameAccessGranted: true, scrollContainer });
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ failed: [], succeeded: [CANDIDATE] });
    expect(writeAttempts).toBe(2);
    expect(callMainWorldMock).toHaveBeenLastCalledWith("delete-records", { recordIds: ["source-1"] });
  });

  it("allows a full render window after an iframe mounts near the loading deadline", async () => {
    callMainWorldMock.mockResolvedValueOnce([
      {
        diagramRecordId: "diagram-1",
        sourceRecordId: "source-1",
        trailingTextRecordId: "text-1",
      },
    ]).mockResolvedValueOnce(["source-1"]);
    let renderReadyAt = Number.POSITIVE_INFINITY;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const request = message as { type: string };
      if (request.type === "write-diagram-frames") {
        renderReadyAt = Date.now() + 4_500;
        return { ok: true, result: [{ frameId: 2, result: { channel: "channel-1", written: true } }] };
      }
      return {
        ok: true,
        result: [{ channel: "channel-1", chartOnly: true, error: false, valid: Date.now() >= renderReadyAt }],
      };
    });
    document.body.innerHTML = '<div data-record-id="diagram-1"></div>';
    window.setTimeout(() => {
      document.body.innerHTML = '<div data-record-id="diagram-1"><iframe channel="channel-1"></iframe></div>';
    }, 7_300);
    const scrollContainer = document.createElement("div");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 600 },
    });

    const promise = repairDiagrams({ candidates: [CANDIDATE], frameAccessGranted: true, scrollContainer });
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ failed: [], succeeded: [CANDIDATE] });
    expect(callMainWorldMock).toHaveBeenLastCalledWith("delete-records", { recordIds: ["source-1"] });
  });

  it("keeps the source and rolls back the diagram after both render windows fail", async () => {
    callMainWorldMock.mockResolvedValueOnce([
      {
        diagramRecordId: "diagram-1",
        sourceRecordId: "source-1",
        trailingTextRecordId: "text-1",
      },
    ]).mockResolvedValueOnce(["diagram-1", "text-1"]);
    let writeAttempts = 0;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const request = message as { type: string };
      if (request.type === "write-diagram-frames") {
        writeAttempts += 1;
        return { ok: true, result: [{ frameId: 2, result: { channel: "channel-1", written: true } }] };
      }
      return { ok: true, result: [{ channel: "channel-1", chartOnly: true, error: true, valid: false }] };
    });
    document.body.innerHTML = '<div data-record-id="diagram-1"><iframe channel="channel-1"></iframe></div>';
    const scrollContainer = document.createElement("div");
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 600 },
    });

    const promise = repairDiagrams({ candidates: [CANDIDATE], frameAccessGranted: true, scrollContainer });
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({
      failed: [{ candidate: CANDIDATE, reason: "图表渲染或展示模式校验失败" }],
      succeeded: [],
    });
    expect(writeAttempts).toBe(2);
    expect(callMainWorldMock).toHaveBeenCalledTimes(2);
    expect(callMainWorldMock).toHaveBeenLastCalledWith("delete-records", { recordIds: ["diagram-1", "text-1"] });
  });
});
