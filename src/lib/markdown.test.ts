import { describe, it, expect } from "vitest";
import {
  getMarkdownStats,
  wrapText,
  prefixLine,
  handleTabIndent,
  handleSmartEnter,
  parseMarkdown,
} from "./markdown";

describe("markdown utilities", () => {
  describe("getMarkdownStats", () => {
    it("handles empty text", () => {
      const stats = getMarkdownStats("");
      expect(stats.characters).toBe(0);
      expect(stats.words).toBe(0);
      expect(stats.lines).toBe(0);
      expect(stats.readingTimeMinutes).toBe(0);
    });

    it("calculates Chinese and English mixed stats", () => {
      const text = "# 欢迎使用 NoahNote\n这是一篇测试笔记。\nHello world!";
      const stats = getMarkdownStats(text);
      expect(stats.lines).toBe(3);
      expect(stats.characters).toBeGreaterThan(20);
      expect(stats.words).toBeGreaterThan(10);
      expect(stats.readingTimeMinutes).toBe(1);
    });
  });

  describe("wrapText", () => {
    it("wraps empty selection with placeholder", () => {
      const res = wrapText("hello world", { start: 5, end: 5 }, "**");
      expect(res.newText).toBe("hello**文本** world");
      expect(res.newSelection).toEqual({ start: 7, end: 9 });
    });

    it("wraps existing selection", () => {
      const res = wrapText("hello world", { start: 6, end: 11 }, "**");
      expect(res.newText).toBe("hello **world**");
      expect(res.newSelection).toEqual({ start: 8, end: 13 });
    });
  });

  describe("prefixLine", () => {
    it("adds prefix to line", () => {
      const res = prefixLine("第一行\n第二行", { start: 5, end: 5 }, "- ");
      expect(res.newText).toBe("第一行\n- 第二行");
    });

    it("toggles prefix off if already present", () => {
      const res = prefixLine("第一行\n- 第二行", { start: 6, end: 6 }, "- ");
      expect(res.newText).toBe("第一行\n第二行");
    });
  });

  describe("handleTabIndent", () => {
    it("inserts 2 spaces on Tab without selection", () => {
      const res = handleTabIndent("code", { start: 2, end: 2 }, false);
      expect(res.newText).toBe("co  de");
      expect(res.newSelection).toEqual({ start: 4, end: 4 });
    });

    it("unindents with Shift+Tab", () => {
      const res = handleTabIndent("  code", { start: 3, end: 3 }, true);
      expect(res.newText).toBe("code");
    });
  });

  describe("handleSmartEnter", () => {
    it("continues bullet list", () => {
      const res = handleSmartEnter("- 第一项", { start: 5, end: 5 });
      expect(res).not.toBeNull();
      expect(res?.newText).toBe("- 第一项\n- ");
    });

    it("clears empty bullet item on enter", () => {
      const res = handleSmartEnter("第一项\n- ", { start: 6, end: 6 });
      expect(res).not.toBeNull();
      expect(res?.newText).toBe("第一项\n");
    });

    it("increments numbered list", () => {
      const res = handleSmartEnter("1. 第一步", { start: 6, end: 6 });
      expect(res).not.toBeNull();
      expect(res?.newText).toBe("1. 第一步\n2. ");
    });

    it("continues task list", () => {
      const res = handleSmartEnter("- [ ] 任务一", { start: 9, end: 9 });
      expect(res).not.toBeNull();
      expect(res?.newText).toBe("- [ ] 任务一\n- [ ] ");
    });
  });

  describe("parseMarkdown", () => {
    it("parses headings and horizontal rule", () => {
      const md = "# Title\n---\n## Subtitle";
      const blocks = parseMarkdown(md);
      expect(blocks).toEqual([
        { type: "heading", level: 1, text: "Title" },
        { type: "hr" },
        { type: "heading", level: 2, text: "Subtitle" },
      ]);
    });

    it("parses code blocks", () => {
      const md = "```ts\nconst x = 1;\n```";
      const blocks = parseMarkdown(md);
      expect(blocks).toEqual([
        { type: "code", lang: "ts", code: "const x = 1;" },
      ]);
    });

    it("parses tables", () => {
      const md = "| A | B |\n|---|---|\n| 1 | 2 |";
      const blocks = parseMarkdown(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("table");
      if (blocks[0].type === "table") {
        expect(blocks[0].headers).toEqual(["A", "B"]);
        expect(blocks[0].rows).toEqual([["1", "2"]]);
      }
    });

    it("parses task lists", () => {
      const md = "- [ ] 待办1\n- [x] 已完成";
      const blocks = parseMarkdown(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("task-list");
      if (blocks[0].type === "task-list") {
        expect(blocks[0].items[0].checked).toBe(false);
        expect(blocks[0].items[1].checked).toBe(true);
      }
    });
  });
});
