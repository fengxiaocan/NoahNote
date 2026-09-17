export function parseTaskImport(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:(?:[-*+]\s+|\d+[.)]\s+))?(?:\[[ xX]\]\s+)?/, "").trim())
    .filter(Boolean);
}

export function importedNoteTitle(path: string, content: string): string {
  const heading = content.match(/^\s*#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
  if (heading) return heading;

  const fileName = path.split(/[\\/]/).pop() ?? "";
  const title = fileName.replace(/\.[^.]+$/, "").trim();
  return title || "导入笔记";
}
