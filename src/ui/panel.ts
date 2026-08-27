import type { RepairCandidate } from "../lark/candidates";

type Tone = "default" | "error" | "success" | "warning";

interface PanelCopy {
  cancel: string;
  close: string;
  empty: string;
  mermaid: string;
  repair: string;
  rescan: string;
  scanning: string;
  subtitle: string;
  table: string;
  title: string;
}

const COPY: Record<"en" | "zh", PanelCopy> = {
  en: {
    cancel: "Stop",
    close: "Close",
    empty: "No table headers or Mermaid blocks need repair.",
    mermaid: "Mermaid drawing",
    repair: "Repair selected",
    rescan: "Scan again",
    scanning: "Scanning the entire document…",
    subtitle: "Review first, then repair the imported Markdown in place.",
    table: "Bold table header",
    title: "Markdown Repair",
  },
  zh: {
    cancel: "停止",
    close: "关闭",
    empty: "没有发现需要修复的表头或 Mermaid 代码块。",
    mermaid: "Mermaid 文本绘图",
    repair: "修复选中项",
    rescan: "重新扫描",
    scanning: "正在扫描整篇文档…",
    subtitle: "先预览，再原地修复导入的 Markdown。",
    table: "表格标题行加粗",
    title: "Markdown 修复",
  },
};

const PANEL_STYLES = `
  :host { all: initial; color-scheme: light; }
  * { box-sizing: border-box; }
  .panel {
    --accent: #4f46e5;
    --accent-soft: #eef2ff;
    --border: #e5e7eb;
    --muted: #667085;
    --text: #172033;
    position: fixed;
    z-index: 2147483647;
    top: 72px;
    right: 18px;
    width: min(384px, calc(100vw - 32px));
    max-height: calc(100vh - 92px);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border) 88%, #a5b4fc);
    border-radius: 16px;
    background: rgba(255, 255, 255, .98);
    box-shadow: 0 18px 52px rgba(30, 41, 59, .18), 0 2px 8px rgba(30, 41, 59, .08);
    color: var(--text);
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  }
  .header { display: flex; gap: 12px; align-items: flex-start; padding: 18px 18px 14px; }
  .mark { display: grid; place-items: center; flex: 0 0 34px; height: 34px; border-radius: 10px; background: linear-gradient(145deg, #312e81, #6366f1); color: white; font: 700 15px/1 ui-monospace, SFMono-Regular, monospace; box-shadow: inset 0 1px rgba(255,255,255,.24); }
  .heading { min-width: 0; flex: 1; }
  h1 { margin: 0; color: #111827; font-size: 15px; font-weight: 680; letter-spacing: -.01em; }
  .subtitle { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
  .icon-button { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: #667085; cursor: pointer; font-size: 19px; }
  .icon-button:hover { background: #f3f4f6; color: #111827; }
  .icon-button:focus-visible, button:focus-visible, input:focus-visible + .checkmark { outline: 2px solid #818cf8; outline-offset: 2px; }
  .body { overflow: auto; max-height: calc(100vh - 235px); border-top: 1px solid #f0f1f4; padding: 14px 16px; }
  .status { display: flex; gap: 10px; align-items: center; min-height: 38px; padding: 9px 11px; border: 1px solid var(--border); border-radius: 10px; background: #fafafa; color: #475467; }
  .status[data-tone="success"] { border-color: #b7e4c7; background: #f0fdf4; color: #166534; }
  .status[data-tone="warning"] { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }
  .status[data-tone="error"] { border-color: #fecaca; background: #fef2f2; color: #b42318; }
  .dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: #98a2b3; }
  .status[data-busy="true"] .dot { background: var(--accent); animation: pulse 1.2s ease-in-out infinite; }
  .status[data-tone="success"] .dot { background: #22c55e; }
  .status[data-tone="warning"] .dot { background: #f97316; }
  .status[data-tone="error"] .dot { background: #ef4444; }
  @keyframes pulse { 50% { transform: scale(1.55); opacity: .45; } }
  @media (prefers-reduced-motion: reduce) { .status[data-busy="true"] .dot { animation: none; } }
  .progress-track { height: 4px; margin: 10px 2px 0; overflow: hidden; border-radius: 99px; background: #eef0f4; }
  .progress-bar { width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #4f46e5, #818cf8); transition: width .18s ease; }
  .list { display: grid; gap: 8px; margin-top: 12px; }
  .candidate { position: relative; display: grid; grid-template-columns: 20px 1fr; gap: 9px; padding: 11px; border: 1px solid var(--border); border-radius: 11px; background: white; cursor: pointer; }
  .candidate:hover { border-color: #c7d2fe; background: #fcfcff; }
  .candidate input { position: absolute; opacity: 0; pointer-events: none; }
  .checkmark { display: grid; place-items: center; width: 17px; height: 17px; margin-top: 1px; border: 1.5px solid #98a2b3; border-radius: 5px; color: transparent; font-size: 11px; }
  .candidate input:checked + .checkmark { border-color: var(--accent); background: var(--accent); color: white; }
  .candidate-title { color: #344054; font-weight: 650; }
  .candidate-content { min-width: 0; }
  .candidate-title, .candidate-preview { display: block; }
  .candidate-preview { margin-top: 2px; overflow: hidden; color: #667085; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
  .empty { padding: 24px 10px; color: #667085; text-align: center; }
  .footer { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 16px 15px; border-top: 1px solid #f0f1f4; background: #fcfcfd; }
  button.action { min-height: 34px; padding: 7px 13px; border: 1px solid #d0d5dd; border-radius: 9px; background: white; color: #344054; cursor: pointer; font: inherit; font-weight: 620; }
  button.action:hover:not(:disabled) { background: #f8fafc; }
  button.action.primary { border-color: var(--accent); background: var(--accent); color: white; }
  button.action.primary:hover:not(:disabled) { background: #4338ca; }
  button.action:disabled { cursor: not-allowed; opacity: .5; }
`;

export interface RepairPanel {
  destroy(): void;
  renderCandidates(candidates: RepairCandidate[]): void;
  selectedCandidates(): RepairCandidate[];
  setBusy(busy: boolean): void;
  setProgress(progress: number): void;
  setStatus(message: string, tone?: Tone): void;
}

interface CreatePanelOptions {
  onCancel: () => void;
  onClose: () => void;
  onRepair: () => void;
  onRescan: () => void;
  root: HTMLElement;
}

export function createRepairPanel({
  onCancel,
  onClose,
  onRepair,
  onRescan,
  root,
}: CreatePanelOptions): RepairPanel {
  const copy = COPY[navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"];
  const shadow = root.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;
  shadow.append(style);

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("aria-label", copy.title);
  const header = document.createElement("header");
  header.className = "header";
  const mark = document.createElement("div");
  mark.className = "mark";
  mark.textContent = "MD";
  const heading = document.createElement("div");
  heading.className = "heading";
  const title = document.createElement("h1");
  title.textContent = copy.title;
  const subtitle = document.createElement("p");
  subtitle.className = "subtitle";
  subtitle.textContent = copy.subtitle;
  heading.append(title, subtitle);
  const close = document.createElement("button");
  close.className = "icon-button";
  close.type = "button";
  close.setAttribute("aria-label", copy.close);
  close.textContent = "×";
  close.onclick = onClose;
  header.append(mark, heading, close);

  const body = document.createElement("div");
  body.className = "body";
  const status = document.createElement("div");
  status.className = "status";
  status.dataset.busy = "true";
  status.dataset.tone = "default";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const dot = document.createElement("span");
  dot.className = "dot";
  const statusText = document.createElement("span");
  statusText.textContent = copy.scanning;
  status.append(dot, statusText);
  const progressTrack = document.createElement("div");
  progressTrack.className = "progress-track";
  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  progressTrack.append(progressBar);
  const list = document.createElement("div");
  list.className = "list";
  body.append(status, progressTrack, list);

  const footer = document.createElement("footer");
  footer.className = "footer";
  const secondary = document.createElement("button");
  secondary.className = "action";
  secondary.type = "button";
  secondary.textContent = copy.cancel;
  secondary.onclick = onCancel;
  const primary = document.createElement("button");
  primary.className = "action primary";
  primary.type = "button";
  primary.textContent = copy.repair;
  primary.disabled = true;
  primary.onclick = onRepair;
  footer.append(secondary, primary);
  panel.append(header, body, footer);
  shadow.append(panel);

  let candidates: RepairCandidate[] = [];
  const selectedIds = new Set<string>();
  let busy = true;

  function renderCandidates(nextCandidates: RepairCandidate[]): void {
    candidates = nextCandidates;
    selectedIds.clear();
    list.replaceChildren();
    for (const candidate of candidates) {
      selectedIds.add(candidate.id);
      const label = document.createElement("label");
      label.className = "candidate";
      label.dataset.candidateId = candidate.id;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      input.addEventListener("change", () => {
        if (input.checked) selectedIds.add(candidate.id);
        else selectedIds.delete(candidate.id);
        primary.disabled = busy || selectedIds.size === 0;
      });
      const checkmark = document.createElement("span");
      checkmark.className = "checkmark";
      checkmark.textContent = "✓";
      const content = document.createElement("span");
      content.className = "candidate-content";
      const candidateTitle = document.createElement("span");
      candidateTitle.className = "candidate-title";
      candidateTitle.textContent =
        candidate.kind === "table" ? copy.table : copy.mermaid;
      const preview = document.createElement("span");
      preview.className = "candidate-preview";
      preview.textContent =
        candidate.kind === "table"
          ? candidate.headerPreview
          : candidate.preview;
      content.append(candidateTitle, preview);
      label.append(input, checkmark, content);
      list.append(label);
    }
    if (candidates.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = copy.empty;
      list.append(empty);
      primary.textContent = copy.rescan;
      primary.disabled = busy;
      primary.onclick = onRescan;
    } else {
      primary.textContent = copy.repair;
      primary.onclick = onRepair;
      primary.disabled = busy;
    }
  }

  return {
    destroy(): void {
      root.remove();
    },
    renderCandidates,
    selectedCandidates(): RepairCandidate[] {
      return candidates.filter(({ id }) => selectedIds.has(id));
    },
    setBusy(nextBusy: boolean): void {
      busy = nextBusy;
      status.dataset.busy = String(busy);
      secondary.textContent = busy ? copy.cancel : copy.rescan;
      secondary.onclick = busy ? onCancel : onRescan;
      primary.disabled = busy || (candidates.length > 0 && selectedIds.size === 0);
      for (const input of list.querySelectorAll<HTMLInputElement>("input")) {
        input.disabled = busy;
      }
    },
    setProgress(progress: number): void {
      const safeProgress = Math.max(0, Math.min(1, progress));
      progressBar.style.width = `${Math.round(safeProgress * 100)}%`;
    },
    setStatus(message: string, tone: Tone = "default"): void {
      status.dataset.tone = tone;
      statusText.textContent = message;
    },
  };
}
