import { Button, DialogLayer, EmptyState, IconButton, SelectableListItem, SelectField, TextArea, TextField } from "../components/ui";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { ContentSpace, Note, Project, Space, SaveType } from "../types";
import { formatRelative, parseTags } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { BacklinksPanel } from "../components/BacklinksPanel";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel";
import { SaveRecordsModal } from "../components/SaveRecordsModal";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import type { CreateKind } from "../components/Modal";
import {
  getMarkdownStats,
  wrapText,
  prefixLine,
  handleTabIndent,
  handleSmartEnter,
} from "../lib/markdown";
import {
  autoSaveIntervalOptions,
  type UserPreferences,
} from "../lib/preferences";
import { useAutoSave } from "../lib/useAutoSave";
import { recordSaveType, addLocalSaveRecord } from "../lib/saveHistory";

interface NotesPageProps {
  space: Space;
  notes: Note[];
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (note: Note) => void | Promise<unknown>;
  onMoveSpace: (note: Note, space: ContentSpace) => void | Promise<unknown>;
  onToggleFavorite: (note: Note) => void;
  onArchive: (note: Note) => void;
  onDelete: (note: Note) => void;
  onAttach: (note: Note) => void;
  onImport: (options?: { folder?: boolean; projectId?: string | null }) => void | Promise<void>;
  onImportFiles?: (files: File[], projectId?: string | null) => void | Promise<void>;
  onRestoreVersion: (versionId: string) => Promise<void>;
  onOpenTarget: (id: string, kind: string) => void;
  preferences?: UserPreferences;
  onPreferencesChange?: (preferences: UserPreferences) => void;
}

export function NotesPage({
  space,
  notes,
  projects,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onMoveSpace,
  onToggleFavorite,
  onArchive,
  onDelete,
  onAttach,
  onImport,
  onImportFiles,
  onRestoreVersion,
  onOpenTarget,
  preferences,
  onPreferencesChange,
}: NotesPageProps) {
  const [showFavorites, setShowFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [zenMode, setZenMode] = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importProjectId, setImportProjectId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const saveTriggerRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter notes based on favorites and search keyword
  const visibleNotes = useMemo(() => {
    let result = showFavorites ? notes.filter((n) => n.favorite) : notes;
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query) ||
          n.tags.some((t) => t.toLowerCase().includes(query))
      );
    }
    return result;
  }, [notes, showFavorites, searchQuery]);

  const selected = notes.find((note) => note.id === selectedId) ?? null;

  const handleSelectNote = (id: string) => {
    if (id === selectedId) return;
    if (isEditorDirty) {
      setPendingSelectId(id);
      return;
    }
    onSelect(id);
  };

  const handleConfirmSaveAndSwitch = () => {
    if (saveTriggerRef.current) {
      saveTriggerRef.current();
    }
    const target = pendingSelectId;
    setPendingSelectId(null);
    if (target) onSelect(target);
  };

  const handleDiscardAndSwitch = () => {
    const target = pendingSelectId;
    setPendingSelectId(null);
    setIsEditorDirty(false);
    if (target) onSelect(target);
  };

  return (
    <div className={`page-stack notes-page ${zenMode ? "is-zen-active" : ""}`}>
      <PageHeader
        eyebrow="记录与思考"
        title="笔记"
        description={`${notes.length} 篇 Markdown 笔记 · 支持双栏实时预览、快捷排版与专注写作`}
        action={
          <>
            <Button
              type="button"
              variant={zenMode ? "primary" : "secondary"}
              onClick={() => setZenMode(!zenMode)}
              title={zenMode ? "退出全屏专注模式" : "进入全屏专注模式"}
            >
              {zenMode ? "退出专注" : "专注模式"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowImportModal(true)}
              title="支持选择多个 Markdown 文件或文件夹批量导入"
            >
              📥 导入 Markdown
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => onCreate("note")}
            >
              ＋ 新建笔记
            </Button>
          </>
        }
      />

      {/* 批量导入 Markdown 弹窗 */}
      {showImportModal && (
        <DialogLayer onClose={() => setShowImportModal(false)}>
          <div className="modal-card import-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">批量导入</span>
                <h2>导入 Markdown 笔记</h2>
                <p className="modal-subtitle">
                  支持选择多个文件、导入整个文件夹或直接拖拽文件
                </p>
              </div>
              <IconButton
                type="button"
                className="close-button"
                onClick={() => setShowImportModal(false)}
                label="关闭"
              >
                ×
              </IconButton>
            </div>

            <div className="modal-body import-modal-body">
              <div className="import-action-grid">
                <div
                  className="import-action-card"
                  onClick={async () => {
                    setShowImportModal(false);
                    await onImport({ folder: false, projectId: importProjectId });
                  }}
                >
                  <span className="import-card-icon">📄</span>
                  <strong>选择多个 Markdown 文件</strong>
                  <p>按住 Ctrl 或 Shift 键可一次性挑选多个 .md / .markdown / .txt 文件</p>
                  <Button type="button" variant="primary" className="compact">选择文件 (多选)</Button>
                </div>

                <div
                  className="import-action-card"
                  onClick={async () => {
                    setShowImportModal(false);
                    await onImport({ folder: true, projectId: importProjectId });
                  }}
                >
                  <span className="import-card-icon">📁</span>
                  <strong>选择 Markdown 文件夹</strong>
                  <p>自动递归扫描所选目录中的全部 Markdown 笔记并批量建立</p>
                  <Button type="button" variant="secondary" className="compact">选择文件夹</Button>
                </div>
              </div>

              <div className="import-options-box">
                <label>
                  <span>可选归属项目：</span>
                  <SelectField
                    value={importProjectId ?? ""}
                    onChange={(e) => setImportProjectId(e.target.value || null)}
                  >
                    <option value="">不归属特定项目</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </SelectField>
                </label>
              </div>

              <div
                className="import-drop-zone-tip"
                onClick={() => fileInputRef.current?.click()}
              >
                <span>💡 提示：也可以随时直接把多个 Markdown 文件拖拽到笔记窗口进行导入</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".md,.markdown,.txt"
                style={{ display: "none" }}
                onChange={async (e) => {
                  if (e.target.files && e.target.files.length > 0 && onImportFiles) {
                    setShowImportModal(false);
                    await onImportFiles(Array.from(e.target.files), importProjectId);
                  }
                }}
              />
            </div>

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setShowImportModal(false)}>
                取消
              </Button>
            </div>
          </div>
        </DialogLayer>
      )}

      {/* Unsaved Changes Confirmation Modal */}
      {pendingSelectId && (
        <DialogLayer onClose={() => setPendingSelectId(null)}>
          <div className="modal-card confirm-modal-card">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">提示</span>
                <h2>未保存的笔记修改</h2>
              </div>
              <IconButton
                type="button"
                className="close-button"
                onClick={() => setPendingSelectId(null)}
                label="关闭"
              >
                ×
              </IconButton>
            </div>
            <div className="modal-body">
              <p className="confirm-modal-body">
                当前笔记有未保存的修改，切换到其他笔记将丢失这些修改。请选择如何处理：
              </p>
            </div>
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPendingSelectId(null)}
              >
                留在当前笔记
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="danger"
                onClick={handleDiscardAndSwitch}
              >
                放弃修改并切换
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmSaveAndSwitch}
              >
                保存并切换
              </Button>
            </div>
          </div>
        </DialogLayer>
      )}

      <div
        className={`notes-workspace ${zenMode ? "zen-layout" : ""} ${isDragging ? "is-drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onImportFiles) {
            await onImportFiles(Array.from(e.dataTransfer.files), importProjectId);
          }
        }}
      >
        {isDragging && (
          <div className="notes-drag-overlay">
            <div className="drag-indicator-box">
              <span className="drag-icon">📥</span>
              <strong>松开鼠标，直接导入 Markdown 笔记</strong>
              <p>支持批量拖入多个 .md / .markdown / .txt 文件</p>
            </div>
          </div>
        )}
        {!zenMode && (
          <section className="notes-list-panel">
            <div className="notes-list-heading">
              <span>{showFavorites ? "我的收藏" : "全部笔记"}</span>
              <div className="heading-actions">
                <button
                  type="button"
                  className={`small-button ${showFavorites ? "is-active" : ""}`}
                  onClick={() => setShowFavorites((curr) => !curr)}
                >
                  {showFavorites ? "全部" : "收藏"}
                </button>
              </div>
            </div>

            {/* Search Box */}
            <div className="notes-search-bar">
              <span className="search-symbol">🔍</span>
              <input
                type="text"
                placeholder="搜索标题、内容或标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery("")}
                  title="清空搜索"
                >
                  ✕
                </button>
              )}
            </div>

            {visibleNotes.length === 0 ? (
              <EmptyState size="compact">
                <span>▤</span>
                <p>
                  {searchQuery
                    ? "未找到匹配的笔记"
                    : showFavorites
                    ? "还没有收藏笔记"
                    : "还没有笔记"}
                </p>
                {searchQuery ? (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => setSearchQuery("")}
                  >
                    清除搜索条件
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => onCreate("note")}
                  >
                    {showFavorites ? "写一篇并收藏 →" : "写一篇 →"}
                  </Button>
                )}
              </EmptyState>
            ) : (
              <div className="notes-list">
                {visibleNotes.map((note) => (
                  <div
                    className={`note-list-row ${
                      note.id === selectedId ? "is-selected" : ""
                    }`}
                    key={note.id}
                  >
                    <SelectableListItem
                      type="button"
                      className="note-list-item" selected={note.id === selectedId}
                      onClick={() => handleSelectNote(note.id)}
                    >
                      <span className="note-symbol">▤</span>
                      <span className="note-list-copy">
                        <strong title={note.title || "无标题笔记"}>
                          {note.title || "无标题笔记"}
                        </strong>
                        <small>
                          {note.content.replace(/[#>*`\n]/g, " ").slice(0, 100) ||
                            "暂无正文"}
                        </small>
                        <time>{formatRelative(note.updatedAt)}</time>
                      </span>
                    </SelectableListItem>
                    <button
                      type="button"
                      className="favorite-toggle"
                      aria-label={note.favorite ? "取消收藏" : "收藏"}
                      title={note.favorite ? "取消收藏" : "收藏"}
                      onClick={() => onToggleFavorite(note)}
                    >
                      {note.favorite ? "★" : "☆"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="note-editor-panel">
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              projects={projects}
              zenMode={zenMode}
              onToggleZen={() => setZenMode(!zenMode)}
              onUpdate={onUpdate}
              onMoveSpace={onMoveSpace}
              onToggleFavorite={onToggleFavorite}
              onArchive={onArchive}
              onDelete={onDelete}
              onAttach={onAttach}
              onRestoreVersion={onRestoreVersion}
              onOpenTarget={onOpenTarget}
              onDirtyChange={setIsEditorDirty}
              registerSaveTrigger={(fn) => {
                saveTriggerRef.current = fn;
              }}
              preferences={preferences}
              onPreferencesChange={onPreferencesChange}
            />
          ) : (
            <EmptyState size="placeholder" className="editor-placeholder">
              <div className="placeholder-glyph">✎</div>
              <h3>选择一篇笔记</h3>
              <p>从左侧打开内容，或新建一篇 Markdown 笔记。</p>
              <Button type="button" variant="primary" onClick={() => onCreate("note")}>
                ＋ 新建笔记
              </Button>
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

interface NoteEditorProps {
  note: Note;
  projects: Project[];
  zenMode: boolean;
  onToggleZen: () => void;
  onUpdate: (note: Note) => void | Promise<unknown>;
  onMoveSpace: (note: Note, space: ContentSpace) => void | Promise<unknown>;
  onToggleFavorite: (note: Note) => void;
  onArchive: (note: Note) => void;
  onDelete: (note: Note) => void;
  onAttach: (note: Note) => void;
  onRestoreVersion: (versionId: string) => Promise<void>;
  onOpenTarget: (id: string, kind: string) => void;
  onDirtyChange: (isDirty: boolean) => void;
  registerSaveTrigger: (fn: () => void) => void;
  preferences?: UserPreferences;
  onPreferencesChange?: (preferences: UserPreferences) => void;
}

function NoteEditor({
  note,
  projects,
  zenMode,
  onToggleZen,
  onUpdate,
  onMoveSpace,
  onToggleFavorite,
  onArchive,
  onDelete,
  onAttach,
  onRestoreVersion,
  onOpenTarget,
  onDirtyChange,
  registerSaveTrigger,
  preferences,
  onPreferencesChange,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState(note.tags.join(" "));
  const [projectId, setProjectId] = useState(note.projectId ?? "");
  const [mode, setMode] = useState<"edit" | "split" | "preview">("split");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "just-saved">("saved");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [autoSaveMenuOpen, setAutoSaveMenuOpen] = useState(false);
  const [saveRecordsModalOpen, setSaveRecordsModalOpen] = useState(false);
  const [saveRecordTrigger, setSaveRecordTrigger] = useState(0);

  const autoSaveEnabled = preferences?.autoSaveEnabled ?? true;
  const autoSaveIntervalSeconds = preferences?.autoSaveIntervalSeconds ?? 15;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync editor draft when note revision changes (e.g., restored from version history)
  const prevRevisionRef = useRef(note.revision);
  useEffect(() => {
    if (note.revision !== prevRevisionRef.current) {
      prevRevisionRef.current = note.revision;
      setTitle((curr) => (curr === note.title ? curr : note.title));
      setContent((curr) => (curr === note.content ? curr : note.content));
      setTags((curr) => (curr === note.tags.join(" ") ? curr : note.tags.join(" ")));
      setProjectId((curr) => (curr === (note.projectId ?? "") ? curr : (note.projectId ?? "")));
    }
  }, [note.revision, note.title, note.content, note.tags, note.projectId]);

  // Check if current draft differs from saved note
  const isDirty = useMemo(() => {
    return (
      title !== note.title ||
      content !== note.content ||
      tags !== note.tags.join(" ") ||
      projectId !== (note.projectId ?? "")
    );
  }, [title, content, tags, projectId, note]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2200);
  }, []);

  const executeSave = useCallback(
    (type: SaveType = "manual") => {
      setSaveStatus("saving");
      const nextRevision = (note.revision || 0) + 1;
      recordSaveType(`${note.id}_rev_${nextRevision}`, type);

      const updatedNote: Note = {
        ...note,
        title: title.trim() || "无标题笔记",
        content,
        tags: parseTags(tags),
        projectId: projectId || null,
      };

      addLocalSaveRecord({
        id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        entityId: note.id,
        entityKind: "note",
        title: updatedNote.title,
        content: updatedNote.content,
        createdAt: new Date().toISOString(),
        revision: nextRevision,
        saveType: type,
        charCount: updatedNote.content.length,
        lineCount: updatedNote.content ? updatedNote.content.split("\n").length : 0,
        wordCount: updatedNote.content.trim().split(/\s+/).filter(Boolean).length,
      });

      const updatePromise = Promise.resolve(onUpdate(updatedNote));
      void updatePromise.finally(() => {
        setSaveRecordTrigger((c) => c + 1);
        markSaved(type);
        setSaveStatus("just-saved");
        if (type === "manual") {
          showToast("✓ 笔记已手动保存并生成版本快照");
        }
        setTimeout(() => setSaveStatus("saved"), 1800);
      });
    },
    [note, title, content, tags, projectId, onUpdate, showToast]
  );

  const {
    lastSavedAt,
    lastSaveType,
    isAutoSaving,
    countdown,
    markSaved,
  } = useAutoSave({
    enabled: autoSaveEnabled,
    intervalSeconds: autoSaveIntervalSeconds,
    isDirty,
    onSave: (type) => executeSave(type),
    entityId: note.id,
  });

  useEffect(() => {
    registerSaveTrigger(() => executeSave("manual"));
  }, [executeSave, registerSaveTrigger]);

  // Text formatting helpers that update textarea and retain selection
  const applyEdit = useCallback(
    (editFn: (text: string, sel: { start: number; end: number }) => {
      newText: string;
      newSelection: { start: number; end: number };
    }) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const result = editFn(content, { start, end });
      setContent(result.newText);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.newSelection.start, result.newSelection.end);
      });
    },
    [content]
  );

  const formatBold = () => applyEdit((t, s) => wrapText(t, s, "**", "**", "加粗文本"));
  const formatItalic = () => applyEdit((t, s) => wrapText(t, s, "*", "*", "斜体文本"));
  const formatStrike = () => applyEdit((t, s) => wrapText(t, s, "~~", "~~", "删除线"));
  const formatInlineCode = () => applyEdit((t, s) => wrapText(t, s, "`", "`", "代码"));
  const formatH1 = () => applyEdit((t, s) => prefixLine(t, s, "# "));
  const formatH2 = () => applyEdit((t, s) => prefixLine(t, s, "## "));
  const formatH3 = () => applyEdit((t, s) => prefixLine(t, s, "### "));
  const formatQuote = () => applyEdit((t, s) => prefixLine(t, s, "> "));
  const formatBulletList = () => applyEdit((t, s) => prefixLine(t, s, "- "));
  const formatOrderedList = () => applyEdit((t, s) => prefixLine(t, s, "1. "));
  const formatTaskList = () => applyEdit((t, s) => prefixLine(t, s, "- [ ] "));

  const formatCodeBlock = () => {
    applyEdit((t, s) => {
      const selected = t.slice(s.start, s.end);
      const replacement = `\`\`\`ts\n${selected || "// 代码块内容"}\n\`\`\`\n`;
      return {
        newText: t.slice(0, s.start) + replacement + t.slice(s.end),
        newSelection: {
          start: s.start + 6,
          end: s.start + replacement.length - 4,
        },
      };
    });
  };

  const formatLink = () => {
    applyEdit((t, s) => {
      const selected = t.slice(s.start, s.end);
      if (selected) {
        return {
          newText: `${t.slice(0, s.start)}[${selected}](https://)${t.slice(s.end)}`,
          newSelection: {
            start: s.start + selected.length + 3,
            end: s.start + selected.length + 11,
          },
        };
      }
      return wrapText(t, s, "[链接文本](", ")", "https://");
    });
  };

  const formatWikiLink = () => {
    applyEdit((t, s) => wrapText(t, s, "[[", "]]", "知识双链页面"));
  };

  const formatTable = () => {
    applyEdit((t, s) => {
      const tableText =
        "\n| 列 1 | 列 2 | 列 3 |\n| :--- | :---: | ---: |\n| 单元格 1 | 单元格 2 | 单元格 3 |\n";
      return {
        newText: t.slice(0, s.start) + tableText + t.slice(s.end),
        newSelection: {
          start: s.start + tableText.length,
          end: s.start + tableText.length,
        },
      };
    });
  };

  const formatDivider = () => {
    applyEdit((t, s) => {
      const hr = "\n---\n";
      return {
        newText: t.slice(0, s.start) + hr + t.slice(s.end),
        newSelection: {
          start: s.start + hr.length,
          end: s.start + hr.length,
        },
      };
    });
  };

  const formatTimestamp = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    applyEdit((t, s) => ({
      newText: t.slice(0, s.start) + dateStr + t.slice(s.end),
      newSelection: {
        start: s.start + dateStr.length,
        end: s.start + dateStr.length,
      },
    }));
  };

  // Keyboard handler for shortcuts (Ctrl+S, Ctrl+B, Ctrl+I, Ctrl+K, Tab, Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl+S / Cmd+S: Save
    if (modifier && e.key.toLowerCase() === "s") {
      e.preventDefault();
      executeSave("manual");
      return;
    }

    // Ctrl+B / Cmd+B: Bold
    if (modifier && e.key.toLowerCase() === "b") {
      e.preventDefault();
      formatBold();
      return;
    }

    // Ctrl+I / Cmd+I: Italic
    if (modifier && e.key.toLowerCase() === "i") {
      e.preventDefault();
      formatItalic();
      return;
    }

    // Ctrl+K / Cmd+K: Link
    if (modifier && e.key.toLowerCase() === "k") {
      e.preventDefault();
      formatLink();
      return;
    }

    // Tab / Shift+Tab: Indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const res = handleTabIndent(
        content,
        { start: textarea.selectionStart, end: textarea.selectionEnd },
        e.shiftKey
      );
      setContent(res.newText);
      requestAnimationFrame(() => {
        textarea.setSelectionRange(res.newSelection.start, res.newSelection.end);
      });
      return;
    }

    // Enter: Smart list and task continuation
    if (e.key === "Enter" && !e.shiftKey) {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const res = handleSmartEnter(content, {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      });
      if (res) {
        e.preventDefault();
        setContent(res.newText);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(res.newSelection.start, res.newSelection.end);
        });
      }
    }
  };

  // Toggle task list items directly in preview/split mode
  const handleToggleTaskItem = (lineIndex: number, checked: boolean) => {
    const lines = content.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    lines[lineIndex] = lines[lineIndex].replace(
      /^(\s*[-*+]\s+\[)[ xX](\]\s*.*)$/,
      `$1${checked ? "x" : " "}$2`
    );
    setContent(lines.join("\n"));
  };

  // Quick action: Copy Markdown
  const copyMarkdown = () => {
    void navigator.clipboard.writeText(content).then(() => {
      showToast("✓ 已复制 Markdown 源码到剪贴板");
    });
  };

  // Quick action: Copy Plain Text
  const copyPlainText = () => {
    const plain = content.replace(/[*#>`~_\[\]()]/g, "").trim();
    void navigator.clipboard.writeText(plain).then(() => {
      showToast("✓ 已复制纯文本到剪贴板");
    });
  };

  // Quick action: Export as .md
  const exportMarkdown = () => {
    const fullText = `# ${title || "无标题笔记"}\n\n${content}`;
    const blob = new Blob([fullText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "笔记"}.md`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("✓ 已导出为 Markdown 文件");
  };

  // Quick action: Discard uncommitted edits
  const discardEdits = () => {
    setTitle(note.title);
    setContent(note.content);
    setTags(note.tags.join(" "));
    setProjectId(note.projectId ?? "");
    showToast("已撤销当前未保存的修改");
  };

  const stats = useMemo(() => getMarkdownStats(content), [content]);

  return (
    <div className="note-editor">
      {/* Editor Header Toolbar */}
      <div className="editor-toolbar">
        <div className="editor-mode-tabs">
          <button
            type="button"
            className={mode === "edit" ? "is-active" : ""}
            onClick={() => setMode("edit")}
            title="纯编辑模式"
          >
            编辑
          </button>
          <button
            type="button"
            className={mode === "split" ? "is-active" : ""}
            onClick={() => setMode("split")}
            title="双栏对照实时预览"
          >
            双栏对照
          </button>
          <button
            type="button"
            className={mode === "preview" ? "is-active" : ""}
            onClick={() => setMode("preview")}
            title="全屏阅读预览"
          >
            预览
          </button>
        </div>

        <div className="editor-actions">
          {/* Auto-save control popover */}
          <div className="auto-save-control-container">
            <Button
              type="button"
              size="small" variant="subtle" className={`auto-save-badge-btn ${autoSaveEnabled ? "is-active" : ""}`}
              onClick={() => setAutoSaveMenuOpen((curr) => !curr)}
              title="定时自动保存配置"
            >
              {autoSaveEnabled ? `⚡ 自动保存 (${autoSaveIntervalSeconds}s)` : "⏸ 自动保存已暂停"} ▾
            </Button>
            {autoSaveMenuOpen && (
              <div className="auto-save-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                <div className="dropdown-title">
                  <strong>定时自动保存设置</strong>
                  <button
                    type="button"
                    className="close-mini-btn"
                    onClick={() => setAutoSaveMenuOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <label className="dropdown-checkbox-row">
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={(e) => {
                      if (onPreferencesChange && preferences) {
                        onPreferencesChange({ ...preferences, autoSaveEnabled: e.target.checked });
                      }
                    }}
                  />
                  <span>开启定时自动保存</span>
                </label>
                <div className="dropdown-select-row">
                  <span>保存间隔：</span>
                  <SelectField
                    value={autoSaveIntervalSeconds}
                    disabled={!autoSaveEnabled}
                    onChange={(e) => {
                      if (onPreferencesChange && preferences) {
                        onPreferencesChange({
                          ...preferences,
                          autoSaveIntervalSeconds: Number(e.target.value),
                        });
                      }
                    }}
                  >
                    {autoSaveIntervalOptions.map((opt) => (
                      <option key={opt.seconds} value={opt.seconds}>
                        {opt.label}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <p className="dropdown-hint">
                  默认开启。内容一旦有改动，将在倒计时结束后自动保存并生成版本记录。
                </p>
              </div>
            )}
          </div>

          {/* Save status pill */}
          {isAutoSaving ? (
            <span className="save-status-pill is-saving" title="正在执行自动保存...">
              ⟳ 自动保存中...
            </span>
          ) : isDirty ? (
            <span
              className="save-status-pill is-dirty"
              title={
                autoSaveEnabled
                  ? `有未保存修改，将在 ${countdown} 秒后自动保存`
                  : "有未保存修改"
              }
            >
              ● 未保存{autoSaveEnabled ? ` (${countdown}s)` : ""}
            </span>
          ) : (
            <span
              className="save-status-pill is-saved"
              title={
                lastSavedAt
                  ? `最后于 ${lastSavedAt.toLocaleTimeString()} ${
                      lastSaveType === "auto" ? "自动保存" : "手动保存"
                    }`
                  : "所有修改已保存"
              }
            >
              ✓ {lastSaveType === "auto" ? "已自动保存" : "已保存"}
            </span>
          )}

          {/* Save Records Modal Button */}
          <Button
            type="button"
            size="small" variant="subtle" className="save-records-entry-btn"
            onClick={() => setSaveRecordsModalOpen(true)}
            title="查看完整保存记录与历史版本快照"
          >
            🕒 保存记录
          </Button>

          <div className="editor-dropdown-actions">
            <Button
              type="button"
              size="small" variant="subtle"
              onClick={copyMarkdown}
              title="复制 Markdown 原文"
            >
              复制
            </Button>
            <Button
              type="button"
              size="small" variant="subtle"
              onClick={exportMarkdown}
              title="导出为 .md 文件"
            >
              导出
            </Button>
          </div>

          <SpaceMoveButton space={note.space} onMove={(nextSpace) => onMoveSpace({ ...note, title: title.trim() || "无标题笔记", content, tags: parseTags(tags), projectId: projectId || null }, nextSpace)} />
          <Button
            type="button"
            size="small" variant="subtle"
            onClick={() => onToggleFavorite(note)}
          >
            {note.favorite ? "取消收藏" : "收藏"}
          </Button>
          <Button type="button" size="small" variant="subtle" onClick={() => onAttach(note)}>
            附件
          </Button>
          <Button type="button" size="small" variant="subtle" onClick={() => onArchive(note)}>
            归档
          </Button>
          <Button
            type="button"
            size="small" variant="danger"
            onClick={() => onDelete(note)}
          >
            删除
          </Button>

          {isDirty && (
            <Button
              type="button"
              size="small" variant="subtle"
              onClick={discardEdits}
              title="放弃未保存修改并重置"
            >
              重置
            </Button>
          )}

          <Button
            type="button"
            variant="primary" className={`compact ${isDirty ? "highlight-pulse" : ""}`}
            onClick={() => executeSave("manual")}
            title="手动保存 (Ctrl+S / Cmd+S)"
          >
            {saveStatus === "saving" ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {/* Markdown Format Toolbar (visible in edit and split modes) */}
      {(mode === "edit" || mode === "split") && (
        <div className="markdown-format-toolbar">
          <div className="fmt-group">
            <button
              type="button"
              className="fmt-btn"
              onClick={formatH1}
              title="一级标题 (# )"
            >
              H1
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatH2}
              title="二级标题 (## )"
            >
              H2
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatH3}
              title="三级标题 (### )"
            >
              H3
            </button>
          </div>

          <div className="fmt-divider" />

          <div className="fmt-group">
            <button
              type="button"
              className="fmt-btn"
              onClick={formatBold}
              title="粗体 (Ctrl+B)"
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatItalic}
              title="斜体 (Ctrl+I)"
            >
              <em>I</em>
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatStrike}
              title="删除线 (~~文本~~)"
            >
              <s>S</s>
            </button>
            <button
              type="button"
              className="fmt-btn code-btn"
              onClick={formatInlineCode}
              title="行内代码 (`code`)"
            >
              &lt;/&gt;
            </button>
          </div>

          <div className="fmt-divider" />

          <div className="fmt-group">
            <button
              type="button"
              className="fmt-btn"
              onClick={formatQuote}
              title="引用块 (> )"
            >
              ”
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatBulletList}
              title="无序列表 (- )"
            >
              • 列表
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatOrderedList}
              title="有序列表 (1. )"
            >
              1. 列表
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatTaskList}
              title="待办任务 (- [ ] )"
            >
              ☑ 待办
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatCodeBlock}
              title="代码块 (```)"
            >
              代码块
            </button>
          </div>

          <div className="fmt-divider" />

          <div className="fmt-group">
            <button
              type="button"
              className="fmt-btn"
              onClick={formatLink}
              title="插入链接 (Ctrl+K)"
            >
              🔗 链接
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatWikiLink}
              title="双链知识关联 ([[ ]])"
            >
              [[双链]]
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatTable}
              title="插入表格"
            >
              ⊞ 表格
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatDivider}
              title="分割线 (---)"
            >
              ― 分割线
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatTimestamp}
              title="插入当前日期时间"
            >
              🕒 时间
            </button>
          </div>

          <div className="fmt-spacer" />

          <div className="fmt-meta-stats">
            <span>{stats.characters} 字符</span>
            <span>{stats.lines} 行</span>
          </div>
        </div>
      )}

      {/* Main Editing Area */}
      <div className="editor-main-container">
        {mode === "edit" && (
          <div className="editor-form">
            <TextField
              className="note-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="无标题笔记"
            />
            <TextArea
              ref={textareaRef}
              className="note-content-input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="# 从这里开始&#10;&#10;支持 Markdown 标题、列表、引用、代码块和表格。&#10;快捷键：Ctrl+S 保存，Ctrl+B 粗体，Ctrl+I 斜体，Ctrl+K 链接，Tab 缩进。"
            />
            <div className="editor-meta">
              <label>
                标签
                <TextField
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="#Android  #研究  #规划"
                />
              </label>
              <label>
                关联项目
                <SelectField
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">不关联项目</option>
                  {projects
                    .filter((project) => project.space === note.space)
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                </SelectField>
              </label>
            </div>
          </div>
        )}

        {mode === "split" && (
          <div className="editor-split-container">
            <div className="editor-split-left">
              <TextField
                className="note-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="无标题笔记"
              />
              <TextArea
                ref={textareaRef}
                className="note-content-input"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="# 从这里开始&#10;&#10;左侧编写 Markdown，右侧实时对照预览。&#10;快捷键：Ctrl+S 保存，Tab 缩进。"
              />
              <div className="editor-meta">
                <label>
                  标签
                  <TextField
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="#Android  #研究"
                  />
                </label>
                <label>
                  关联项目
                  <SelectField
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">不关联项目</option>
                    {projects
                      .filter((project) => project.space === note.space)
                      .map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                  </SelectField>
                </label>
              </div>
            </div>

            <div className="editor-split-right">
              <div className="preview-wrap">
                <h2>{title || "无标题笔记"}</h2>
                <MarkdownPreview
                  content={content}
                  onToggleTaskItem={handleToggleTaskItem}
                  onWikiLinkClick={(target) => onOpenTarget(target, "note")}
                />
              </div>
            </div>
          </div>
        )}

        {mode === "preview" && (
          <div className="preview-wrap preview-full">
            <h2>{title || "无标题笔记"}</h2>
            <MarkdownPreview
              content={content}
              onToggleTaskItem={handleToggleTaskItem}
              onWikiLinkClick={(target) => onOpenTarget(target, "note")}
            />
            <div className="preview-footer">
              <span>最后更新于 {formatRelative(note.updatedAt)}</span>
              <span>
                {stats.characters} 字符 · 预计阅读时间约 {stats.readingTimeMinutes}{" "}
                分钟
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Editor Bottom Stats Bar */}
      <footer className="editor-stats-bar">
        <div className="stats-group">
          <span className="stat-item">
            <strong>{stats.characters}</strong> 字符
          </span>
          <span className="stat-sep">/</span>
          <span className="stat-item">
            <strong>{stats.words}</strong> 词
          </span>
          <span className="stat-sep">/</span>
          <span className="stat-item">
            <strong>{stats.lines}</strong> 行
          </span>
          <span className="stat-sep">/</span>
          <span className="stat-item">
            约 <strong>{stats.readingTimeMinutes}</strong> 分钟阅读
          </span>
        </div>

        <div className="stats-right">
          {toastMessage && <span className="toast-inline">{toastMessage}</span>}
          <button
            type="button"
            className="stats-save-history-btn"
            onClick={() => setSaveRecordsModalOpen(true)}
            title="查看全部自动与手动保存记录"
          >
            🕒 {lastSavedAt ? `上次于 ${lastSavedAt.toLocaleTimeString()} ${lastSaveType === "auto" ? "自动保存" : "手动保存"}` : "保存记录"}
          </button>
          <span className="shortcut-hint">按 Ctrl+S 快速保存</span>
        </div>
      </footer>

      {/* Save Records Modal */}
      <SaveRecordsModal
        isOpen={saveRecordsModalOpen}
        onClose={() => setSaveRecordsModalOpen(false)}
        entityId={note.id}
        entityKind="note"
        entityTitle={title}
        currentContent={content}
        onRestore={async (versionId) => {
          await onRestoreVersion(versionId);
          setSaveRecordTrigger((c) => c + 1);
        }}
        refreshTrigger={saveRecordTrigger}
      />

      {/* Panels */}
      <BacklinksPanel id={note.id} kind="note" onOpen={onOpenTarget} />
      <VersionHistoryPanel
        id={note.id}
        kind="note"
        currentContent={note.content}
        onRestore={onRestoreVersion}
        refreshTrigger={saveRecordTrigger}
        onOpenRecordsModal={() => setSaveRecordsModalOpen(true)}
      />
    </div>
  );
}
