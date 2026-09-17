import { describe, expect, it } from "vitest";
import { importedNoteTitle, parseTaskImport } from "./import";

describe("import helpers", () => {
  it("uses each non-empty line as one task and removes common list markers", () => {
    expect(parseTaskImport("- 第一项\r\n\n2. 第二项\n[ ] 第三项\n")).toEqual(["第一项", "第二项", "第三项"]);
  });

  it("prefers the first Markdown heading for an imported note title", () => {
    expect(importedNoteTitle("C:\\notes\\meeting.md", "正文\n# 会议纪要\n")).toBe("会议纪要");
  });

  it("falls back to the file name when an imported note has no heading", () => {
    expect(importedNoteTitle("C:\\notes\\daily.md", "没有标题")).toBe("daily");
  });
});
