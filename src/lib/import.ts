export function parseTaskImport(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:(?:[-*+]\s+|\d+[.)]\s+))?(?:\[[ xX]\]\s+)?/, "").trim())
    .filter(Boolean);
}

export interface ParsedMarkdownNote {
  title: string;
  content: string;
  tags: string[];
}

export function parseMarkdownNoteImport(path: string, rawText: string): ParsedMarkdownNote {
  const text = (rawText || "").replace(/^\uFEFF/, "");
  let title = "";
  const tags: string[] = [];
  let content = text;

  // 1. Try to parse YAML Frontmatter: ^---\r?\n([\s\S]*?)\r?\n---
  const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch) {
    const yamlBody = frontmatterMatch[1];
    content = text.slice(frontmatterMatch[0].length);

    // Extract title: "..." or title: ...
    const titleMatch = yamlBody.match(/^title:\s*["']?(.*?)["']?\s*$/m);
    if (titleMatch && titleMatch[1].trim()) {
      title = titleMatch[1].trim();
    }

    // Extract tags: [a, b] or tags: \n - a \n - b
    const tagsArrayMatch = yamlBody.match(/^tags:\s*\[(.*?)\]/m);
    if (tagsArrayMatch) {
      tagsArrayMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
        .forEach((t) => tags.push(t));
    } else {
      const tagLines = yamlBody.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
      if (tagLines) {
        tagLines[1]
          .split("\n")
          .map((line) => line.replace(/^\s*-\s*/, "").trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean)
          .forEach((t) => tags.push(t));
      }
    }
  }

  // 2. If no title from frontmatter, look for first `# Heading`
  if (!title) {
    const heading = content.match(/^\s*#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
    if (heading) {
      title = heading;
    }
  }

  // 3. Fallback to file name
  if (!title) {
    const fileName = path.split(/[\\/]/).pop() ?? "";
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, "").trim();
    title = nameWithoutExt || "导入笔记";
  }

  // 4. Also collect inline #tags from content if any
  const inlineTags = content.match(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu);
  if (inlineTags) {
    inlineTags.forEach((t) => {
      const cleaned = t.trim().replace(/^#/, "");
      if (cleaned && !tags.includes(cleaned)) {
        tags.push(cleaned);
      }
    });
  }

  return {
    title,
    content,
    tags: Array.from(new Set(tags)),
  };
}

export function importedNoteTitle(path: string, content: string): string {
  const parsed = parseMarkdownNoteImport(path, content);
  return parsed.title;
}
