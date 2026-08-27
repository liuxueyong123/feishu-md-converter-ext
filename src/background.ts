const SUPPORTED_LARK_DOCUMENT =
  /^https:\/\/(?:[a-z0-9-]+\.)*larksuite\.com\/(?:docx|wiki)\//i;

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
  if (tab.id === undefined) {
    return;
  }

  if (!tab.url || !SUPPORTED_LARK_DOCUMENT.test(tab.url)) {
    void showUnsupportedPage(tab.id);
    return;
  }

  void chrome.scripting.executeScript({
    files: ["content.js"],
    target: { tabId: tab.id },
  });
});

