const REQUEST_EVENT = "lark-markdown-repair:main-request:v2";
const RESPONSE_EVENT = "lark-markdown-repair:main-response:v2";

interface BridgeResponse<T> {
  error?: string;
  id: string;
  result?: T;
}

export interface CreatedDiagram {
  diagramRecordId: string;
  sourceRecordId: string;
  // Only records created by this migration may be removed during rollback.
  trailingTextRecordId: string | null;
}

function createRequestId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export function callMainWorld<T>(
  command:
    | "bold-text-records"
    | "format-table-header"
    | "read-heading-spacing"
    | "insert-heading-spacing"
    | "read-sheet-tables"
    | "convert-sheet-table"
    | "create-diagrams"
    | "delete-records"
    | "read-code-records",
  payload: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<T> {
  const id = createRequestId();
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${command}：等待 Lark 编辑器响应超时`));
    }, timeoutMs);

    const cleanup = (): void => {
      window.clearTimeout(timeout);
      document.removeEventListener(RESPONSE_EVENT, handleResponse);
    };

    const handleResponse = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string") {
        return;
      }
      let response: BridgeResponse<T>;
      try {
        response = JSON.parse(detail) as BridgeResponse<T>;
      } catch {
        return;
      }
      if (response.id !== id) {
        return;
      }
      cleanup();
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response.result as T);
      }
    };

    document.addEventListener(RESPONSE_EVENT, handleResponse);
    document.dispatchEvent(
      new CustomEvent(REQUEST_EVENT, {
        detail: JSON.stringify({ command, id, ...payload }),
      }),
    );
  });
}
