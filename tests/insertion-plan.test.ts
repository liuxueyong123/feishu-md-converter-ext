import { describe, expect, it } from "vitest";

import {
  createDiagramRecord,
  createEmptyTextRecord,
  planDiagramInsertions,
} from "../src/lark/insertion-plan";

describe("planDiagramInsertions", () => {
  it("inserts from the end of each parent so earlier indexes stay stable", () => {
    expect(
      planDiagramInsertions([
        {
          parentRecordId: "root",
          sourceIndex: 2,
          sourceRecordId: "first",
        },
        {
          parentRecordId: "root",
          sourceIndex: 7,
          sourceRecordId: "second",
        },
        {
          parentRecordId: "cell",
          sourceIndex: 1,
          sourceRecordId: "nested",
        },
      ]),
    ).toEqual([
      {
        insertionIndex: 8,
        parentRecordId: "root",
        sourceRecordId: "second",
      },
      {
        insertionIndex: 3,
        parentRecordId: "root",
        sourceRecordId: "first",
      },
      {
        insertionIndex: 2,
        parentRecordId: "cell",
        sourceRecordId: "nested",
      },
    ]);
  });
});

describe("native Lark record factories", () => {
  it("builds the text drawing record observed from Lark's native menu", () => {
    expect(createDiagramRecord("root", "author-1")).toEqual({
      app_block_id: "",
      author: "author-1",
      block_type_id: "blk_640017963d808005a21a6445",
      children: [],
      comment_details: {},
      comments: [],
      data: {},
      manifest: { app_version: "", view_type: "block_h5" },
      parent_id: "root",
      revisions: [],
      size: { height: 280 },
      type: "isv",
    });
  });

  it("builds the empty paragraph Lark appends after a drawing", () => {
    expect(createEmptyTextRecord("root", "author-1")).toEqual({
      author: "author-1",
      children: [],
      comments: [],
      folded: false,
      parent_id: "root",
      revisions: [],
      text: {
        apool: { nextNum: 0, numToAttrib: {} },
        initialAttributedTexts: {
          attribs: { "0": "" },
          text: { "0": "" },
        },
      },
      type: "text",
    });
  });
});
