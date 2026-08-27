const ROOT_ID = "lark-markdown-repair-root";

function injectProbePanel(): void {
  const existingRoot = document.getElementById(ROOT_ID);
  if (existingRoot) {
    existingRoot.dispatchEvent(new CustomEvent("lark-markdown-repair:open"));
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("data-extension-version", chrome.runtime.getManifest().version);
  document.documentElement.append(root);

  const shadowRoot = root.attachShadow({ mode: "open" });
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  status.textContent = "Lark Markdown Repair 已连接";
  status.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "right:16px",
    "bottom:16px",
    "padding:10px 14px",
    "border:1px solid #d9d9df",
    "border-radius:8px",
    "background:#fff",
    "box-shadow:0 6px 24px rgb(15 23 42 / 14%)",
    "color:#1f2329",
    "font:13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
  ].join(";");
  shadowRoot.append(status);
}

injectProbePanel();

