import { describe, expect, it } from "vitest";
import { importedNoteTitle, parseMarkdownNoteImport, parseTaskImport } from "./import";

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

  it("parses YAML frontmatter title, tags, and content properly", () => {
    const raw = `---
title: "项目架构设计"
tags: [architecture, backend, tauri]
---

# 概述

这是架构设计正文 #design
`;
    const parsed = parseMarkdownNoteImport("/home/user/docs/arch.md", raw);
    expect(parsed.title).toBe("项目架构设计");
    expect(parsed.tags).toContain("architecture");
    expect(parsed.tags).toContain("backend");
    expect(parsed.tags).toContain("tauri");
    expect(parsed.tags).toContain("design");
    expect(parsed.content).toContain("# 概述");
    expect(parsed.content).not.toContain("title: \"项目架构设计\"");
  });

  it("handles frontmatter with list-style tags", () => {
    const raw = `---
title: 读书笔记
tags:
  - books
  - philosophy
---
内容
`;
    const parsed = parseMarkdownNoteImport("reading.md", raw);
    expect(parsed.title).toBe("读书笔记");
    expect(parsed.tags).toEqual(["books", "philosophy"]);
    expect(parsed.content.trim()).toBe("内容");
  });
});
