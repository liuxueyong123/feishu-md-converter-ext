import type { RepairCandidate } from "../lark/candidates";

type Tone = "default" | "error" | "success" | "warning";

interface PanelCopy {
  cancel: string;
  close: string;
  empty: string;
  heading: string;
  mermaid: string;
  navigate: string;
  repair: string;
  rescan: string;
  start: string;
  scanning: string;
  sheet: string;
  subtitle: string;
  table: string;
  title: string;
}

const COPY: Record<"en" | "zh", PanelCopy> = {
  en: {
    cancel: "Stop",
    close: "Close",
    empty: "No table headers, embedded sheets, Mermaid blocks, or heading spacing need repair.",
    heading: "Add blank line before heading",
    mermaid: "Mermaid drawing",
    navigate: "Go to this block",
    repair: "Repair selected",
    rescan: "Scan again",
    start: "Start scan",
    scanning: "Scanning the entire document…",
    sheet: "Convert sheet to document table",
    subtitle: "Review first, then repair the imported Markdown in place.",
    table: "Bold and shade table header",
    title: "Markdown Repair",
  },
  zh: {
    cancel: "停止",
    close: "关闭",
    empty: "没有发现需要修复的表头、电子表格、Mermaid 代码块或标题空行。",
    heading: "标题前补空行",
    mermaid: "Mermaid 文本绘图",
    navigate: "定位到此区块",
    repair: "修复选中项",
    rescan: "重新扫描",
    start: "开始扫描",
    scanning: "正在扫描整篇文档…",
    sheet: "电子表格转文档表格",
    subtitle: "先预览，再原地修复导入的 Markdown。",
    table: "表头加粗并添加底色",
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
  .candidate { position: relative; display: grid; grid-template-columns: 20px 1fr; gap: 9px; padding: 11px; border: 1px solid var(--border); border-radius: 11px; background: white; }
  .candidate:hover { border-color: #c7d2fe; background: #fcfcff; }
  .selection { cursor: pointer; }
  .candidate input { position: absolute; opacity: 0; pointer-events: none; }
  .checkmark { display: grid; place-items: center; width: 17px; height: 17px; margin-top: 1px; border: 1.5px solid #98a2b3; border-radius: 5px; color: transparent; font-size: 11px; }
  .candidate input:checked + .checkmark { border-color: var(--accent); background: var(--accent); color: white; }
  .candidate-title { color: #344054; font-weight: 650; }
  .candidate-content { min-width: 0; }
  .candidate-link { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; text-align: left; }
  .candidate-link:disabled { cursor: not-allowed; }
  .candidate-title, .candidate-preview { display: block; }
  .candidate-preview { margin-top: 2px; overflow: hidden; color: #667085; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
  .candidate-preview[data-warning="true"] { white-space: normal; color: #9a3412; }
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
  setCompleted(): void;
  setBusy(busy: boolean): void;
  setProgress(progress: number): void;
  setStatus(message: string, tone?: Tone): void;
}

interface CreatePanelOptions {
  onCancel: () => void;
  onClose: () => void;
  onNavigate: (candidate: RepairCandidate) => void;
  onRepair: () => void;
  onRescan: () => void;
  onStart: () => void;
  root: HTMLElement;
}

export function createRepairPanel({
  onCancel,
  onClose,
  onNavigate,
  onRepair,
  onRescan,
  onStart,
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
  status.dataset.busy = "false";
  status.dataset.tone = "default";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const dot = document.createElement("span");
  dot.className = "dot";
  const statusText = document.createElement("span");
  statusText.textContent = copy.start;
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
  secondary.textContent = copy.close;
  secondary.onclick = onClose;
  const primary = document.createElement("button");
  primary.className = "action primary";
  primary.type = "button";
  primary.textContent = copy.start;
  primary.disabled = false;
  primary.onclick = onStart;
  footer.append(secondary, primary);
  panel.append(header, body, footer);
  shadow.append(panel);

  let candidates: RepairCandidate[] = [];
  const selectedIds = new Set<string>();
  let busy = false;
  let hasScanned = false;
  let completed = false;

  function renderCandidates(nextCandidates: RepairCandidate[]): void {
    hasScanned = true;
    completed = false;
    primary.hidden = false;
    candidates = nextCandidates;
    selectedIds.clear();
    list.replaceChildren();
    for (const candidate of candidates) {
      const label = copy[candidate.kind];
      const unsupportedReason = candidate.kind === "sheet" ? candidate.unsupportedReason : undefined;
      if (!unsupportedReason) selectedIds.add(candidate.id);
      const card = document.createElement("div");
      card.className = "candidate";
      card.dataset.candidateId = candidate.id;
      const selection = document.createElement("label");
      selection.className = "selection";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !unsupportedReason;
      input.disabled = busy || Boolean(unsupportedReason);
      input.dataset.unsupported = String(Boolean(unsupportedReason));
      input.setAttribute("aria-label", label);
      input.addEventListener("change", () => {
        if (unsupportedReason) return;
        if (input.checked) selectedIds.add(candidate.id);
        else selectedIds.delete(candidate.id);
        primary.disabled = busy || selectedIds.size === 0;
      });
      const checkmark = document.createElement("span");
      checkmark.className = "checkmark";
      checkmark.textContent = "✓";
      selection.append(input, checkmark);
      const content = document.createElement("button");
      content.className = "candidate-content candidate-link";
      content.type = "button";
      content.setAttribute("aria-label", copy.navigate);
      content.onclick = () => onNavigate(candidate);
      const candidateTitle = document.createElement("span");
      candidateTitle.className = "candidate-title";
      candidateTitle.textContent = label;
      const preview = document.createElement("span");
      preview.className = "candidate-preview";
      preview.textContent =
        candidate.kind === "table"
          ? candidate.headerPreview
          : candidate.preview;
      if (unsupportedReason) {
        preview.textContent = unsupportedReason;
        preview.dataset.warning = "true";
      }
      preview.title = preview.textContent;
      content.append(candidateTitle, preview);
      card.append(selection, content);
      list.append(card);
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
      primary.disabled = busy || selectedIds.size === 0;
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
    setCompleted(): void {
      completed = true;
      primary.hidden = true;
      primary.onclick = () => undefined;
    },
    setBusy(nextBusy: boolean): void {
      busy = nextBusy;
      status.dataset.busy = String(busy);
      secondary.textContent = busy
        ? copy.cancel
        : hasScanned
          ? copy.rescan
          : copy.close;
      secondary.onclick = busy || hasScanned
        ? busy
          ? onCancel
          : onRescan
        : onClose;
      if (!completed) {
        primary.disabled = busy || (candidates.length > 0 && selectedIds.size === 0);
      }
      for (const input of list.querySelectorAll<HTMLInputElement>("input")) {
        input.disabled = busy || input.dataset.unsupported === "true";
      }
      for (const button of list.querySelectorAll<HTMLButtonElement>(
        ".candidate-link",
      )) {
        button.disabled = busy;
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
