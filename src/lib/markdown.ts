export interface MarkdownStats {
  characters: number;
  words: number;
  lines: number;
  readingTimeMinutes: number;
}

export function getMarkdownStats(text: string): MarkdownStats {
  if (!text) {
    return { characters: 0, words: 0, lines: 0, readingTimeMinutes: 0 };
  }
  const characters = text.replace(/\s/g, "").length;
  // CJK characters count as 1 word each
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  // Non-CJK words split by whitespace/punctuation
  const nonCjkWords = (
    text
      .replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, " ")
      .match(/[a-zA-Z0-9_-]+/g) || []
  ).length;
  const words = cjkChars + nonCjkWords;
  const lines = text.split("\n").length;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 350));
  return { characters, words, lines, readingTimeMinutes };
}

export interface TextSelection {
  start: number;
  end: number;
}

export interface InsertResult {
  newText: string;
  newSelection: TextSelection;
}

export function wrapText(
  text: string,
  selection: TextSelection,
  prefix: string,
  suffix: string = prefix,
  placeholder = "文本"
): InsertResult {
  const selectedText = text.slice(selection.start, selection.end);
  if (selectedText) {
    const newText =
      text.slice(0, selection.start) +
      prefix +
      selectedText +
      suffix +
      text.slice(selection.end);
    return {
      newText,
      newSelection: {
        start: selection.start + prefix.length,
        end: selection.end + prefix.length,
      },
    };
  }

  const newText =
    text.slice(0, selection.start) +
    prefix +
    placeholder +
    suffix +
    text.slice(selection.end);
  return {
    newText,
    newSelection: {
      start: selection.start + prefix.length,
      end: selection.start + prefix.length + placeholder.length,
    },
  };
}

export function prefixLine(
  text: string,
  selection: TextSelection,
  linePrefix: string
): InsertResult {
  const lineStart = text.lastIndexOf("\n", selection.start - 1) + 1;
  const lineEnd = text.indexOf("\n", selection.end);
  const effectiveLineEnd = lineEnd === -1 ? text.length : lineEnd;

  const currentLine = text.slice(lineStart, effectiveLineEnd);
  // If already prefixed with this prefix, toggle it off
  if (currentLine.startsWith(linePrefix)) {
    const newText =
      text.slice(0, lineStart) +
      currentLine.slice(linePrefix.length) +
      text.slice(effectiveLineEnd);
    const offset = -linePrefix.length;
    return {
      newText,
      newSelection: {
        start: Math.max(lineStart, selection.start + offset),
        end: Math.max(lineStart, selection.end + offset),
      },
    };
  }

  const newText =
    text.slice(0, lineStart) +
    linePrefix +
    currentLine +
    text.slice(effectiveLineEnd);
  const offset = linePrefix.length;
  return {
    newText,
    newSelection: {
      start: selection.start + offset,
      end: selection.end + offset,
    },
  };
}

export function handleTabIndent(
  text: string,
  selection: TextSelection,
  shiftKey: boolean
): InsertResult {
  const tabSpaces = "  ";

  if (!shiftKey) {
    // If no selection, insert 2 spaces
    if (selection.start === selection.end) {
      const newText =
        text.slice(0, selection.start) + tabSpaces + text.slice(selection.end);
      return {
        newText,
        newSelection: {
          start: selection.start + 2,
          end: selection.start + 2,
        },
      };
    }

    // Multi-line selection: indent each selected line
    const lineStart = text.lastIndexOf("\n", selection.start - 1) + 1;
    const lineEndIdx = text.indexOf("\n", selection.end);
    const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const indented = lines.map((l) => tabSpaces + l).join("\n");
    const addedChars = lines.length * 2;

    const newText = text.slice(0, lineStart) + indented + text.slice(lineEnd);
    return {
      newText,
      newSelection: {
        start: selection.start + 2,
        end: selection.end + addedChars,
      },
    };
  }

  // Shift + Tab: unindent lines
  const lineStart = text.lastIndexOf("\n", selection.start - 1) + 1;
  const lineEndIdx = text.indexOf("\n", selection.end);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  let removedFirstLineChars = 0;
  let totalRemoved = 0;

  const unindented = lines
    .map((l, index) => {
      let removed = 0;
      if (l.startsWith("  ")) {
        removed = 2;
      } else if (l.startsWith(" ") || l.startsWith("\t")) {
        removed = 1;
      }
      if (index === 0) removedFirstLineChars = removed;
      totalRemoved += removed;
      return l.slice(removed);
    })
    .join("\n");

  const newText = text.slice(0, lineStart) + unindented + text.slice(lineEnd);
  return {
    newText,
    newSelection: {
      start: Math.max(lineStart, selection.start - removedFirstLineChars),
      end: Math.max(lineStart, selection.end - totalRemoved),
    },
  };
}

export function handleSmartEnter(
  text: string,
  selection: TextSelection
): InsertResult | null {
  if (selection.start !== selection.end) return null;

  const lineStart = text.lastIndexOf("\n", selection.start - 1) + 1;
  const lineEndIdx = text.indexOf("\n", selection.start);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;

  const currentLineBeforeCursor = text.slice(lineStart, selection.start);

  // 1. Task item: - [ ] or - [x]
  const taskMatch = currentLineBeforeCursor.match(/^(\s*[-*+]\s+\[[ xX]\])\s*(.*)$/);
  if (taskMatch) {
    const [, prefix, rest] = taskMatch;
    // If the item has no text and user presses Enter, clear the list item
    if (!rest.trim() && selection.start === lineEnd) {
      const newText = text.slice(0, lineStart) + text.slice(lineEnd);
      return {
        newText,
        newSelection: { start: lineStart, end: lineStart },
      };
    }
    const indentMatch = prefix.match(/^(\s*)/);
    const nextItem = `\n${indentMatch ? indentMatch[1] : ""}- [ ] `;
    const newText =
      text.slice(0, selection.start) + nextItem + text.slice(selection.end);
    const newPos = selection.start + nextItem.length;
    return {
      newText,
      newSelection: { start: newPos, end: newPos },
    };
  }

  // 2. Unordered bullet item: - or * or +
  const bulletMatch = currentLineBeforeCursor.match(/^(\s*[-*+])\s+(.*)$/);
  if (bulletMatch) {
    const [, prefix, rest] = bulletMatch;
    if (!rest.trim() && selection.start === lineEnd) {
      const newText = text.slice(0, lineStart) + text.slice(lineEnd);
      return {
        newText,
        newSelection: { start: lineStart, end: lineStart },
      };
    }
    const nextItem = `\n${prefix} `;
    const newText =
      text.slice(0, selection.start) + nextItem + text.slice(selection.end);
    const newPos = selection.start + nextItem.length;
    return {
      newText,
      newSelection: { start: newPos, end: newPos },
    };
  }

  // 3. Ordered item: 1. 2. 3.
  const orderedMatch = currentLineBeforeCursor.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (orderedMatch) {
    const [, indent, numStr, rest] = orderedMatch;
    if (!rest.trim() && selection.start === lineEnd) {
      const newText = text.slice(0, lineStart) + text.slice(lineEnd);
      return {
        newText,
        newSelection: { start: lineStart, end: lineStart },
      };
    }
    const nextNum = parseInt(numStr, 10) + 1;
    const nextItem = `\n${indent}${nextNum}. `;
    const newText =
      text.slice(0, selection.start) + nextItem + text.slice(selection.end);
    const newPos = selection.start + nextItem.length;
    return {
      newText,
      newSelection: { start: newPos, end: newPos },
    };
  }

  // 4. Blockquote: >
  const quoteMatch = currentLineBeforeCursor.match(/^(\s*>)\s*(.*)$/);
  if (quoteMatch) {
    const [, prefix, rest] = quoteMatch;
    if (!rest.trim() && selection.start === lineEnd) {
      const newText = text.slice(0, lineStart) + text.slice(lineEnd);
      return {
        newText,
        newSelection: { start: lineStart, end: lineStart },
      };
    }
    const nextItem = `\n${prefix} `;
    const newText =
      text.slice(0, selection.start) + nextItem + text.slice(selection.end);
    const newPos = selection.start + nextItem.length;
    return {
      newText,
      newSelection: { start: newPos, end: newPos },
    };
  }

  return null;
}

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; start: number; items: string[] }
  | {
      type: "task-list";
      items: { checked: boolean; text: string; lineIndex: number }[];
    }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "hr" };

export function parseMarkdown(content: string): MarkdownBlock[] {
  if (!content.trim()) return [];
  const lines = content.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Code block ```
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({
        type: "code",
        lang,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // 2. Horizontal rule: ---, ***, ___
    if (/^(?:---|\*\*\*|___)\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // 3. Heading: # ... ######
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({
        type: "heading",
        level,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // 4. Blockquote: > ...
    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        text: quoteLines.join("\n"),
      });
      continue;
    }

    // 5. Table check: line has | and next line has |-
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(lines[i + 1])
    ) {
      const parseCells = (row: string) =>
        row
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim());

      const headers = parseCells(line);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(parseCells(lines[i]));
        i++;
      }
      blocks.push({
        type: "table",
        headers,
        rows,
      });
      continue;
    }

    // 6. Task List: - [ ] or - [x]
    if (/^\s*[-*+]\s+\[[ xX]\]\s*/.test(line)) {
      const items: { checked: boolean; text: string; lineIndex: number }[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/);
        if (!itemMatch) break;
        items.push({
          checked: itemMatch[1].toLowerCase() === "x",
          text: itemMatch[2],
          lineIndex: i,
        });
        i++;
      }
      blocks.push({
        type: "task-list",
        items,
      });
      continue;
    }

    // 7. Unordered List: - or * or +
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        // Stop if it's a task list
        if (/^\s*[-*+]\s+\[[ xX]\]\s*/.test(lines[i])) break;
        const bulletMatch = lines[i].match(/^\s*[-*+]\s+(.*)$/);
        if (!bulletMatch) break;
        items.push(bulletMatch[1]);
        i++;
      }
      if (items.length > 0) {
        blocks.push({
          type: "unordered-list",
          items,
        });
      }
      continue;
    }

    // 8. Ordered List: 1. 2.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      const firstMatch = line.match(/^\s*(\d+)\.\s+/);
      const start = firstMatch ? parseInt(firstMatch[1], 10) : 1;
      while (i < lines.length) {
        const orderMatch = lines[i].match(/^\s*\d+\.\s+(.*)$/);
        if (!orderMatch) break;
        items.push(orderMatch[1]);
        i++;
      }
      blocks.push({
        type: "ordered-list",
        start,
        items,
      });
      continue;
    }

    // 9. Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // 10. Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !/^(?:---|\*\*\*|___)\s*$/.test(lines[i].trim()) &&
      !lines[i].match(/^(#{1,6})\s+/) &&
      !lines[i].trim().startsWith(">") &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(lines[i + 1])
      )
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paraLines.join("\n"),
      });
    }
  }

  return blocks;
}
