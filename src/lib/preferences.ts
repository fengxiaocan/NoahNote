import type { PageId, TaskPriority } from "../types";

export type ContentWidth = "standard" | "wide" | "full";
export type EditorFontSize = "small" | "normal" | "medium" | "large";

export interface UserPreferences {
  sidebarCollapsed: boolean;
  sidebarCompact: boolean;
  defaultStartupPage: PageId;
  contentWidth: ContentWidth;
  editorFontSize: EditorFontSize;
  showLineNumbers: boolean;
  taskDefaultPriority: TaskPriority;
  autoSaveEnabled: boolean;
  autoSaveIntervalSeconds: number;
}

export const defaultPreferences: UserPreferences = {
  sidebarCollapsed: false,
  sidebarCompact: false,
  defaultStartupPage: "overview",
  contentWidth: "standard",
  editorFontSize: "normal",
  showLineNumbers: true,
  taskDefaultPriority: "normal",
  autoSaveEnabled: true,
  autoSaveIntervalSeconds: 15,
};

export const preferencesStorageKey = "noahnote-user-preferences";

export const startupPageOptions: Array<{ id: PageId; label: string }> = [
  { id: "overview", label: "总览 (Overview)" },
  { id: "today", label: "今天 (Today)" },
  { id: "tasks", label: "任务 (Tasks)" },
  { id: "notes", label: "笔记 (Notes)" },
  { id: "projects", label: "项目 (Projects)" },
  { id: "inbox", label: "收件箱 (Inbox)" },
  { id: "sparks", label: "思维灵光 (Sparks)" },
  { id: "knowledge", label: "知识库 (Knowledge)" },
  { id: "schedule", label: "日程 (Schedule)" },
];

export const fontSizeMap: Record<EditorFontSize, { label: string; px: string }> = {
  small: { label: "小号 (13px)", px: "13px" },
  normal: { label: "标准 (14px)", px: "14px" },
  medium: { label: "中等 (16px)", px: "16px" },
  large: { label: "大号 (18px)", px: "18px" },
};

export const contentWidthMap: Record<ContentWidth, { label: string; width: string; description: string }> = {
  standard: { label: "标准居中", width: "1120px", description: "专注舒适的阅读版心 (1120px)" },
  wide: { label: "宽屏模式", width: "1440px", description: "适合大屏双列与看板 (1440px)" },
  full: { label: "全宽铺满", width: "100%", description: "无最大宽度限制，占满工作区" },
};

export const autoSaveIntervalOptions: Array<{ seconds: number; label: string }> = [
  { seconds: 5, label: "5 秒 (极速)" },
  { seconds: 10, label: "10 秒" },
  { seconds: 15, label: "15 秒 (推荐)" },
  { seconds: 30, label: "30 秒" },
  { seconds: 60, label: "1 分钟" },
];

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parsePreferences(raw: string | null | undefined): UserPreferences {
  if (!raw) return defaultPreferences;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultPreferences;
    return {
      sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      sidebarCompact: Boolean(parsed.sidebarCompact),
      defaultStartupPage: startupPageOptions.some((p) => p.id === parsed.defaultStartupPage)
        ? parsed.defaultStartupPage
        : defaultPreferences.defaultStartupPage,
      contentWidth: parsed.contentWidth in contentWidthMap ? parsed.contentWidth : defaultPreferences.contentWidth,
      editorFontSize: parsed.editorFontSize in fontSizeMap ? parsed.editorFontSize : defaultPreferences.editorFontSize,
      showLineNumbers: parsed.showLineNumbers !== false,
      taskDefaultPriority: ["urgent", "high", "normal", "low"].includes(parsed.taskDefaultPriority)
        ? parsed.taskDefaultPriority
        : defaultPreferences.taskDefaultPriority,
      autoSaveEnabled: parsed.autoSaveEnabled !== false,
      autoSaveIntervalSeconds:
        typeof parsed.autoSaveIntervalSeconds === "number" && parsed.autoSaveIntervalSeconds > 0
          ? parsed.autoSaveIntervalSeconds
          : defaultPreferences.autoSaveIntervalSeconds,
    };
  } catch {
    return defaultPreferences;
  }
}

export function loadPreferences(storage?: StorageLike): UserPreferences {
  try {
    const targetStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!targetStorage) return defaultPreferences;
    return parsePreferences(targetStorage.getItem(preferencesStorageKey));
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(prefs: UserPreferences, storage?: StorageLike): void {
  try {
    const targetStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!targetStorage) return;
    targetStorage.setItem(preferencesStorageKey, JSON.stringify(prefs));
  } catch {
    // Graceful ignore
  }
}

export function toggleSidebarPreference(prefs: UserPreferences): UserPreferences {
  return {
    ...prefs,
    sidebarCollapsed: !prefs.sidebarCollapsed,
  };
}

export function applyPreferencesToDom(prefs: UserPreferences): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;

  root.dataset.sidebarCollapsed = String(prefs.sidebarCollapsed);
  root.dataset.sidebarCompact = String(prefs.sidebarCompact);
  root.dataset.contentWidth = prefs.contentWidth;
  root.dataset.editorFontSize = prefs.editorFontSize;

  const fontPx = fontSizeMap[prefs.editorFontSize]?.px ?? "14px";
  root.style.setProperty("--editor-font-size", fontPx);

  const maxWidth = contentWidthMap[prefs.contentWidth]?.width ?? "1120px";
  root.style.setProperty("--content-max-width", maxWidth);
}
