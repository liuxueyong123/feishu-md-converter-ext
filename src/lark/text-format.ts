export interface BoldTextEdit {
  changeset: {
    apool: {
      nextNum: 1;
      numToAttrib: { "0": ["bold", "true"] };
    };
    zone_changesets: { "0": string };
  };
  recordId: string;
}

export function createBoldTextEdit(
  recordId: string,
  textLength: number,
): BoldTextEdit {
  if (!recordId || !Number.isSafeInteger(textLength) || textLength <= 0) {
    throw new Error("表头文本记录无效");
  }
  if (textLength > 1_000_000) {
    throw new Error("表头文本超过安全长度");
  }
  const encodedLength = textLength.toString(36);
  return {
    changeset: {
      apool: {
        nextNum: 1,
        numToAttrib: { "0": ["bold", "true"] },
      },
      zone_changesets: {
        "0": `Z:${encodedLength}>0*0=${encodedLength}$`,
      },
    },
    recordId,
  };
}
