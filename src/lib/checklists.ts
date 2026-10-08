import type { Checklist, ChecklistItem } from "../types";

export interface ChecklistStats {
  totalItems: number;
  completedItems: number;
  remainingItems: number;
  completionRate: number; // 0 - 100
  isAllCompleted: boolean;
}

export type ChecklistFilterStatus = "all" | "in_progress" | "completed" | "favorite";

export type ChecklistSortOption =
  | "updated"
  | "created"
  | "title"
  | "progress-desc"
  | "progress-asc"
  | "items-desc";

export interface ChecklistFilterOptions {
  status?: ChecklistFilterStatus;
  search?: string;
  sortBy?: ChecklistSortOption;
}

export function calculateChecklistStats(checklist: Checklist): ChecklistStats {
  const totalItems = checklist.items.length;
  if (totalItems === 0) {
    return {
      totalItems: 0,
      completedItems: 0,
      remainingItems: 0,
      completionRate: 0,
      isAllCompleted: false,
    };
  }

  const completedItems = checklist.items.filter((item) => item.completed).length;
  const remainingItems = totalItems - completedItems;
  const completionRate = Math.round((completedItems / totalItems) * 100);
  const isAllCompleted = completedItems === totalItems;

  return {
    totalItems,
    completedItems,
    remainingItems,
    completionRate,
    isAllCompleted,
  };
}

export function filterAndSortChecklists(
  checklists: Checklist[],
  options: ChecklistFilterOptions
): Checklist[] {
  let result = [...checklists];

  // 1. Status filter
  if (options.status === "favorite") {
    result = result.filter((c) => c.favorite);
  } else if (options.status === "completed") {
    result = result.filter((c) => {
      const stats = calculateChecklistStats(c);
      return stats.totalItems > 0 && stats.isAllCompleted;
    });
  } else if (options.status === "in_progress") {
    result = result.filter((c) => {
      const stats = calculateChecklistStats(c);
      return stats.totalItems === 0 || !stats.isAllCompleted;
    });
  }

  // 2. Search query filter (searches title, description, tags, and items)
  const q = options.search?.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.items.some((item) => item.text.toLowerCase().includes(q))
    );
  }

  // 3. Sorting
  const sortBy = options.sortBy ?? "updated";
  result.sort((a, b) => {
    if (sortBy === "updated") {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (sortBy === "created") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === "title") {
      return a.title.localeCompare(b.title, "zh-CN");
    }
    if (sortBy === "progress-desc") {
      return calculateChecklistStats(b).completionRate - calculateChecklistStats(a).completionRate;
    }
    if (sortBy === "progress-asc") {
      return calculateChecklistStats(a).completionRate - calculateChecklistStats(b).completionRate;
    }
    if (sortBy === "items-desc") {
      return b.items.length - a.items.length;
    }
    return 0;
  });

  return result;
}

export function parseChecklistItemsFromText(
  text: string,
  startPosition = 0
): ChecklistItem[] {
  const lines = text.split(/\r?\n/);
  const items: ChecklistItem[] = [];
  let pos = startPosition;

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    let completed = false;

    // Check for markdown checkbox: - [ ] or - [x] / - [X]
    const mdCheckMatch = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (mdCheckMatch) {
      completed = mdCheckMatch[1].toLowerCase() === "x";
      line = mdCheckMatch[2].trim();
    } else {
      // Strip leading bullet like "- ", "* ", "+ "
      line = line.replace(/^[-*+]\s+/, "");
      // Strip leading numbered list like "1. ", "1) "
      line = line.replace(/^\d+[\.\)]\s+/, "");
    }

    if (!line) continue;

    items.push({
      id: crypto.randomUUID(),
      text: line,
      completed,
      position: pos++,
    });
  }

  return items;
}

export function exportChecklistToMarkdown(checklist: Checklist): string {
  const parts: string[] = [`# ${checklist.title}`];

  if (checklist.description) {
    parts.push(checklist.description);
  }

  if (checklist.tags && checklist.tags.length > 0) {
    parts.push(checklist.tags.map((t) => `#${t}`).join(" "));
  }

  parts.push(""); // empty line before items

  for (const item of checklist.items) {
    const mark = item.completed ? "[x]" : "[ ]";
    parts.push(`- ${mark} ${item.text}`);
  }

  return parts.join("\n");
}

export function toggleAllChecklistItems(
  items: ChecklistItem[],
  completed: boolean
): ChecklistItem[] {
  return items.map((item) => ({ ...item, completed }));
}

export function removeCompletedChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  return items
    .filter((item) => !item.completed)
    .map((item, idx) => ({ ...item, position: idx }));
}

export function cloneChecklist(
  checklist: Checklist,
  newTitle?: string
): Omit<Checklist, "id"> {
  return {
    title: newTitle ?? `${checklist.title} (副本)`,
    description: checklist.description,
    items: checklist.items.map((item, idx) => ({
      ...item,
      id: crypto.randomUUID(),
      completed: false, // Reset completed status on clone by default for reuse
      position: idx,
    })),
    space: checklist.space,
    tags: [...checklist.tags],
    favorite: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deviceId: checklist.deviceId,
    workspaceId: checklist.workspaceId,
    revision: 1,
  };
}
