import type { TableCandidate } from "./candidates";
import { callMainWorld } from "./main-bridge";

export async function repairTableHeader(
  candidate: TableCandidate,
): Promise<void> {
  await callMainWorld<string[]>("format-table-header", {
    recordId: candidate.recordId,
  });
}
