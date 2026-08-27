import {
  type DiagramFrameItem,
  type ExtensionRequest,
  parseExtensionRequest,
} from "./extension-messages";

const SUPPORTED_LARK_DOCUMENT =
  /^https:\/\/(?:[a-z0-9-]+\.)*larksuite\.com\/(?:docx|wiki)\//i;
const DRAWING_FRAME_PERMISSION = "https://*.larksuitepkg.com/*";

interface FrameValidation {
  channel: string;
  chartOnly: boolean;
  error: boolean;
  valid: boolean;
}

function writeDiagramFrame(items: DiagramFrameItem[]): {
  channel?: string;
  written: boolean;
} {
  if (!location.hostname.endsWith(".larksuitepkg.com")) {
    return { written: false };
  }
  let channel: string | undefined;
  try {
    const frameName: unknown = JSON.parse(window.name);
    if (
      typeof frameName === "object" &&
      frameName !== null &&
      "channel" in frameName &&
      typeof frameName.channel === "string"
    ) {
      channel = frameName.channel;
    }
  } catch {
    return { written: false };
  }
  const item = items.find((candidate) => candidate.channel === channel);
  if (!item || !channel) {
    return { channel, written: false };
  }
  let parentOrigin: string;
  try {
    parentOrigin = new URL(document.referrer).origin;
    if (!parentOrigin.endsWith(".larksuite.com")) {
      return { channel, written: false };
    }
  } catch {
    return { channel, written: false };
  }
  const requestId = Math.floor(Math.random() * 1_000_000_000);
  const request = {
    channel,
    dehydrates: [],
    payload: JSON.stringify({
      data: {
        0: [
          {
            data: {
              path: [],
              value: {
                data: item.source,
                theme: "default",
                view: "chart",
              },
            },
            type: "replace",
          },
        ],
      },
      id: requestId,
      name: "Record_setRecord",
    }),
    signature: "iframe-block",
    timestamp: Date.now(),
    type: "request",
  };
  parent.postMessage(request, parentOrigin);
  return { channel, written: true };
}

function validateDiagramFrame(channels: string[]): FrameValidation | null {
  if (!location.hostname.endsWith(".larksuitepkg.com")) {
    return null;
  }
  let channel: string | undefined;
  try {
    const frameName: unknown = JSON.parse(window.name);
    if (
      typeof frameName === "object" &&
      frameName !== null &&
      "channel" in frameName &&
      typeof frameName.channel === "string"
    ) {
      channel = frameName.channel;
    }
  } catch {
    return null;
  }
  if (!channel || !channels.includes(channel)) {
    return null;
  }
  const text = document.body.innerText;
  const error =
    /(?:syntax|parse|lexical)\s+error|no diagram type detected|error parsing mermaid|语法错误|解析错误/iu.test(
      text,
    );
  const editor = document.querySelector<HTMLElement>(
    ".content-editable[contenteditable]",
  );
  const chartOnly =
    !editor || window.getComputedStyle(editor).display === "none";
  const valid =
    Boolean(
      document.querySelector(
        ".right-wrapper svg, svg[aria-roledescription], svg.flowchart, svg.sequenceDiagram",
      ),
    ) && !error;
  return { channel, chartOnly, error, valid };
}

async function handleExtensionRequest(
  request: ExtensionRequest,
  tabId: number,
): Promise<unknown> {
  if (request.type === "request-drawing-frame-access") {
    const granted = await chrome.permissions.request({
      origins: [DRAWING_FRAME_PERMISSION],
    });
    return { granted };
  }

  if (request.type === "write-diagram-frames") {
    const results = await chrome.scripting.executeScript({
      args: [request.items],
      func: writeDiagramFrame,
      target: { allFrames: true, tabId },
      world: "MAIN",
    });
    return results.map(({ frameId, result }) => ({ frameId, result }));
  }

  const results = await chrome.scripting.executeScript({
    args: [request.channels],
    func: validateDiagramFrame,
    target: { allFrames: true, tabId },
    world: "MAIN",
  });
  return results.flatMap(({ result }) => (result ? [result] : []));
}

async function showUnsupportedPage(tabId: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: "#D14343", tabId });
  await chrome.action.setBadgeText({ tabId, text: "!" });
  await chrome.action.setTitle({
    tabId,
    title: "请先打开 Lark Docx 或 Wiki 文档",
  });
}

// Chrome recommends activeTab + scripting for user-invoked, temporary access.
// Sources:
// https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
// https://developer.chrome.com/docs/extensions/reference/api/scripting
chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id;
  if (tabId === undefined) {
    return;
  }

  if (!tab.url || !SUPPORTED_LARK_DOCUMENT.test(tab.url)) {
    void showUnsupportedPage(tabId);
    return;
  }

  void (async () => {
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.scripting.executeScript({
      files: ["main-world.js"],
      target: { tabId },
      world: "MAIN",
    });
    await chrome.scripting.executeScript({
      files: ["content.js"],
      target: { tabId },
    });
  })();
});

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    const request = parseExtensionRequest(message);
    const tabId = sender.tab?.id;
    if (
      !request ||
      tabId === undefined ||
      sender.frameId !== 0 ||
      !sender.url ||
      !SUPPORTED_LARK_DOCUMENT.test(sender.url)
    ) {
      return false;
    }
    void handleExtensionRequest(request, tabId)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) =>
        sendResponse({
          error: error instanceof Error ? error.message : "扩展操作失败",
          ok: false,
        }),
      );
    return true;
  },
);
