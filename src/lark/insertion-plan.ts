export const TEXT_DRAWING_BLOCK_TYPE_ID = "blk_640017963d808005a21a6445";

export interface DiagramInsertionTarget {
  parentRecordId: string;
  sourceIndex: number;
  sourceRecordId: string;
}

export interface PlannedDiagramInsertion {
  insertionIndex: number;
  parentRecordId: string;
  sourceRecordId: string;
}

export interface NativeDiagramRecord {
  app_block_id: string;
  author: string;
  block_type_id: string;
  children: never[];
  comment_details: Record<string, never>;
  comments: never[];
  data: Record<string, never>;
  manifest: { app_version: string; view_type: "block_h5" };
  parent_id: string;
  revisions: never[];
  size: { height: 280 };
  type: "isv";
}

export interface NativeEmptyTextRecord {
  author: string;
  children: never[];
  comments: never[];
  folded: false;
  parent_id: string;
  revisions: never[];
  text: {
    apool: { nextNum: 0; numToAttrib: Record<string, never> };
    initialAttributedTexts: {
      attribs: { "0": "" };
      text: { "0": "" };
    };
  };
  type: "text";
}

export function planDiagramInsertions(
  targets: readonly DiagramInsertionTarget[],
): PlannedDiagramInsertion[] {
  const byParent = new Map<string, PlannedDiagramInsertion[]>();

  for (const { parentRecordId, sourceIndex, sourceRecordId } of targets) {
    const group = byParent.get(parentRecordId) ?? [];
    group.push({
      insertionIndex: sourceIndex + 1,
      parentRecordId,
      sourceRecordId,
    });
    byParent.set(parentRecordId, group);
  }

  return Array.from(byParent.values()).flatMap((group) =>
    group.sort((left, right) => right.insertionIndex - left.insertionIndex),
  );
}

export function createDiagramRecord(
  parentRecordId: string,
  author: string,
): NativeDiagramRecord {
  return {
    app_block_id: "",
    author,
    block_type_id: TEXT_DRAWING_BLOCK_TYPE_ID,
    children: [],
    comment_details: {},
    comments: [],
    data: {},
    manifest: { app_version: "", view_type: "block_h5" },
    parent_id: parentRecordId,
    revisions: [],
    size: { height: 280 },
    type: "isv",
  };
}

export function createEmptyTextRecord(
  parentRecordId: string,
  author: string,
): NativeEmptyTextRecord {
  return {
    author,
    children: [],
    comments: [],
    folded: false,
    parent_id: parentRecordId,
    revisions: [],
    text: {
      apool: { nextNum: 0, numToAttrib: {} },
      initialAttributedTexts: {
        attribs: { "0": "" },
        text: { "0": "" },
      },
    },
    type: "text",
  };
}
