import { useEffect, useMemo, useState } from "react";
import type { PageId } from "../types";

export type PaletteCommand = {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  action: "note" | "task" | "project" | "inbox" | "spark" | "checklist" | "template" | "event" | "sync" | "sync-status" | "sync-log" | PageId;
};

interface CommandPaletteProps {
  onClose: () => void;
  onSelect: (command: PaletteCommand) => void;
}

export function CommandPalette({ onClose, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const commands: PaletteCommand[] = useMemo(() => [
    { id: "new-note", label: "新建笔记", description: "记录一个想法或一段 Markdown", shortcut: "Ctrl ⇧ N", action: "note" },
    { id: "new-task", label: "新建任务", description: "把下一步变成可执行的任务", shortcut: "Ctrl ⇧ T", action: "task" },
    { id: "new-event", label: "新建日程", description: "把会议或行动安排到具体时间", action: "event" },
    { id: "new-project", label: "新建项目", description: "建立任务和笔记的共同上下文", action: "project" },
    { id: "new-checklist", label: "新建 Checklist", description: "把重复流程拆成清晰步骤", action: "checklist" },
    { id: "new-template", label: "新建模板", description: "保存一份可以重复使用的结构", action: "template" },
    { id: "capture", label: "快速记录", description: "先把临时想法放进收件箱", shortcut: "Ctrl ⇧ Space", action: "inbox" },
    { id: "new-spark", label: "记录思维灵光", description: "捕捉一个值得继续发展的想法", action: "spark" },
    { id: "sparks", label: "打开思维灵光", description: "回顾和发展已经记录的想法", action: "sparks" },
    { id: "overview", label: "打开总览", description: "回到今天的工作台", action: "overview" },
    { id: "today", label: "打开今天", description: "查看今天的任务和记录", action: "today" },
    { id: "tasks", label: "打开任务", description: "查看所有任务", action: "tasks" },
    { id: "schedule", label: "打开日程", description: "查看日、周和列表视图", action: "schedule" },
    { id: "notes", label: "打开笔记", description: "查看最近编辑的笔记", action: "notes" },
    { id: "projects", label: "打开项目", description: "查看进行中的项目", action: "projects" },
    { id: "checklists", label: "打开 Checklist", description: "查看可执行的清单", action: "checklists" },
    { id: "templates", label: "打开模板", description: "管理可复用内容", action: "templates" },
    { id: "knowledge", label: "打开知识库", description: "管理目录、页面和双向链接", action: "knowledge" },
    { id: "documents", label: "打开 PDF 文档", description: "导入、预览、OCR 和检索 PDF", action: "documents" },
    { id: "plugins", label: "打开插件", description: "管理本地插件清单和权限", action: "plugins" },
    { id: "trash", label: "打开回收站", description: "恢复或永久删除内容", action: "trash" },
    { id: "settings", label: "打开设置与同步", description: "管理 Workspace、备份和同步", action: "settings" },
    { id: "sync-now", label: "立即同步", description: "按当前同步方式推送并拉取 Workspace", action: "sync" },
    { id: "sync-status", label: "检查同步状态", description: "查看远端状态与冲突", action: "sync-status" },
    { id: "sync-log", label: "打开同步日志", description: "查看最近的同步记录", action: "sync-log" },
  ], []);
  const filtered = useMemo(() => commands.filter((command) => (command.label + " " + command.description).toLowerCase().includes(query.trim().toLowerCase())), [commands, query]);
  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
      if (event.key === "Enter" && filtered[activeIndex]) { event.preventDefault(); onSelect(filtered[activeIndex]); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, onClose, onSelect]);
  return <div className="modal-backdrop command-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="command-card"><div className="command-input-wrap"><span>⌘</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入命令或搜索功能…" /></div><div className="command-list">{filtered.length === 0 ? <div className="command-empty">没有匹配的命令</div> : filtered.map((command, index) => <button className={["command-row", index === activeIndex ? "is-active" : ""].join(" ")} key={command.id} onClick={() => onSelect(command)}><span className="command-symbol">{command.action === "note" ? "▤" : command.action === "task" ? "✓" : command.action === "project" ? "◆" : command.action === "inbox" ? "▣" : command.action === "spark" || command.action === "sparks" ? "✦" : "→"}</span><span className="command-copy"><strong>{command.label}</strong><small>{command.description}</small></span>{command.shortcut ? <kbd>{command.shortcut}</kbd> : null}</button>)}</div><div className="command-footer"><span>↑↓ 选择</span><span>Enter 执行</span><span>Esc 关闭</span></div></div></div>;
}
