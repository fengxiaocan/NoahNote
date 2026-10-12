import type { ReactNode, RefObject } from "react";
import type { PageId, SearchResult, Space } from "../types";
import type { Theme } from "../lib/theme";
import { formatRelative } from "../lib/format";
import { IconButton, SegmentButton, SegmentedControl } from "./ui";

const navItems: Array<{ id: PageId; label: string; icon: string }> = [
  { id: "overview", label: "总览", icon: "⌂" },
  { id: "inbox", label: "收件箱", icon: "▣" },
  { id: "sparks", label: "思维灵光", icon: "✦" },
  { id: "today", label: "今天", icon: "☀" },
  { id: "tasks", label: "任务", icon: "✓" },
  { id: "schedule", label: "日程", icon: "◷" },
  { id: "notes", label: "笔记", icon: "▤" },
  { id: "projects", label: "项目", icon: "◆" },
  { id: "checklists", label: "清单", icon: "☑" },
  { id: "templates", label: "模板", icon: "▱" },
  { id: "knowledge", label: "知识库", icon: "⌘" },
  { id: "documents", label: "PDF 文档", icon: "▥" },
  { id: "plugins", label: "插件", icon: "◇" },
  { id: "archive", label: "归档空间", icon: "▱" },
  { id: "trash", label: "回收站", icon: "♧" },
];

const spaceLabels: Record<Space, string> = {
  all: "全部",
  personal: "个人",
  work: "工作",
};

interface AppShellProps {
  activePage: PageId;
  space: Space;
  searchQuery: string;
  searchResults: SearchResult[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  inboxCount: number;
  onNavigate: (page: PageId) => void;
  onSpaceChange: (space: Space) => void;
  onSearchChange: (query: string) => void;
  onSearchFocus: () => void;
  onOpenSearchResult: (result: SearchResult) => void;
  onQuickCapture: () => void;
  theme: Theme;
  onThemeToggle: () => void;
  onMinimizeToTray: () => void;
  onRefresh: () => void;
  children: ReactNode;
}

export function AppShell({
  activePage,
  space,
  searchQuery,
  searchResults,
  searchInputRef,
  loading,
  inboxCount,
  onNavigate,
  onSpaceChange,
  onSearchChange,
  onSearchFocus,
  onOpenSearchResult,
  onQuickCapture,
  theme,
  onThemeToggle,
  onMinimizeToTray,
  onRefresh,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">N</div>
          <div>
            <strong>Noah</strong>
            <span>工作助手</span>
          </div>
        </div>

        <div className="sidebar-section-label">工作台</div>
        <nav className="primary-nav" aria-label="主导航">
          {navItems.map((item) => (
            <button
              className={`nav-item ${activePage === item.id ? "is-active" : ""}`}
              key={item.id}
              title={item.label}
              aria-label={item.label}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.id === "inbox" && inboxCount > 0 ? (
                <span className="nav-count">{inboxCount}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />
        <div className="sidebar-section-label">空间</div>
        <div className="space-list">
          {(["personal", "work"] as const).map((item) => (
            <button
              className={`space-nav-item ${space === item ? "is-active" : ""}`}
              key={item}
              title={`${spaceLabels[item]}空间`}
              aria-label={`${spaceLabels[item]}空间`}
              onClick={() => onSpaceChange(item)}
            >
              <span className={`space-dot ${item}`} />
              <span className="nav-label">{spaceLabels[item]}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <button className={`nav-item ${activePage === "settings" ? "is-active" : ""}`} title="设置与同步" aria-label="设置与同步" onClick={() => onNavigate("settings")}>
            <span className="nav-icon" aria-hidden="true">⚙</span>
            <span className="nav-label">设置与同步</span>
          </button>
          <div className="local-first-badge">
            <span className="status-dot" />
            <div>
              <strong>本地优先</strong>
              <span>数据保存在你的设备</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="search-wrap">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              aria-label="全局搜索"
              placeholder="搜索任务、笔记、PDF、项目…"
              ref={searchInputRef}
              value={searchQuery}
              onFocus={onSearchFocus}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            <kbd>Ctrl K</kbd>
            {searchQuery.trim() && searchResults.length > 0 ? (
              <div className="search-popover">
                <div className="search-popover-heading">搜索结果 · {searchResults.length}</div>
                {searchResults.slice(0, 8).map((result) => (
                  <button className="search-result" key={`${result.kind}-${result.id}`} onClick={() => onOpenSearchResult(result)}>
                    <span className={`result-type ${result.kind}`}>{result.kind === "note" ? "笔" : result.kind === "task" ? "✓" : result.kind === "project" ? "◆" : result.kind === "event" ? "◷" : result.kind === "checklist" ? "☑" : result.kind === "knowledge_page" ? "⌘" : result.kind === "pdf" ? "PDF" : "收"}</span>
                    <span className="result-copy">
                      <strong>{result.title}</strong>
                      <small>{result.snippet || "暂无摘要"}</small>
                    </span>
                    <time>{formatRelative(result.updatedAt)}</time>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="topbar-actions">
            <SegmentedControl className="top-space-switcher" label="空间切换" variant="surface">
              {(["all", "personal", "work"] as const).map((item) => (
                <SegmentButton selected={space === item} key={item} onClick={() => onSpaceChange(item)}>
                  {spaceLabels[item]}
                </SegmentButton>
              ))}
            </SegmentedControl>
            <button className="quick-capture-button" title="快速记录" aria-label="快速记录" onClick={onQuickCapture}>
              <span>＋</span><span className="quick-capture-label">快速记录</span><kbd>Ctrl ⇧ Space</kbd>
            </button>
            <IconButton className="theme-toggle" title={theme === "dark" ? "切换到浅色主题" : "切换到暗色主题"} label={theme === "dark" ? "切换到浅色主题" : "切换到暗色主题"} aria-pressed={theme === "dark"} onClick={onThemeToggle}>
              <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
            </IconButton>
            <IconButton label="最小化到托盘" onClick={onMinimizeToTray}>
              <span>⌄</span>
            </IconButton>
            <IconButton label="刷新数据" onClick={onRefresh} disabled={loading} aria-busy={loading}>
              <span className={loading ? "spin" : ""} aria-hidden="true">↻</span>
            </IconButton>
          </div>
        </header>
        <main className="content-area">{children}</main>
      </div>
    </div>
  );
}
