export interface MermaidDetection {
  isMermaid: boolean;
  normalizedSource: string;
  signature: string | null;
}

const ZERO_WIDTH_CHARACTERS = /[\u200B\u200C\u200D\u2060\uFEFF]/gu;
const MERMAID_INIT_DIRECTIVE = /^%%\{\s*init\b/i;
const MERMAID_DIAGRAM_SIGNATURE =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|mindmap|timeline|journey|quadrantChart|requirementDiagram|gitGraph|pie|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|sankey-beta|xychart-beta|block-beta|packet-beta|architecture-beta|radar-beta|kanban)(?=\s|$)/i;

export function normalizeMermaidSource(source: string): string {
  const lines = source
    .replace(/\r\n?/g, "\n")
    .replace(ZERO_WIDTH_CHARACTERS, "")
    .split("\n");

  while (lines.length > 0 && lines[0]?.trim() === "") {
    lines.shift();
  }

  while (lines.length > 0 && lines.at(-1)?.trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}

export function detectMermaidSource(source: string): MermaidDetection {
  const normalizedSource = normalizeMermaidSource(source);

  for (const sourceLine of normalizedSource.split("\n")) {
    const line = sourceLine.trim();
    if (line === "") {
      continue;
    }

    if (MERMAID_INIT_DIRECTIVE.test(line)) {
      return { isMermaid: true, normalizedSource, signature: "init" };
    }

    if (line.startsWith("%%")) {
      continue;
    }

    const signature = line.match(MERMAID_DIAGRAM_SIGNATURE)?.[1] ?? null;
    return {
      isMermaid: signature !== null,
      normalizedSource,
      signature,
    };
  }

  return { isMermaid: false, normalizedSource, signature: null };
}

