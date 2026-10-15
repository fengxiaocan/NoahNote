import { Button, DialogLayer, EmptyState, IconButton, SelectField, TextArea, TextField } from "../components/ui";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import type { KnowledgeFolderInput, KnowledgePageInput } from "../lib/api";
import { parseTags, formatRelative } from "../lib/format";
import { BacklinksPanel } from "../components/BacklinksPanel";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PageHeader } from "../components/PageHeader";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel";
import { SaveRecordsModal } from "../components/SaveRecordsModal";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import type { ContentSpace, KnowledgeNode, KnowledgePage, Note, Space, SaveType } from "../types";
import {
  getMarkdownStats,
  wrapText,
  prefixLine,
  handleTabIndent,
  handleSmartEnter,
} from "../lib/markdown";
import { autoSaveIntervalOptions, type UserPreferences } from "../lib/preferences";
import { useAutoSave } from "../lib/useAutoSave";
import { recordSaveType, addLocalSaveRecord } from "../lib/saveHistory";

interface KnowledgeBasePageProps {
  space: Space;
  createSpace: "personal" | "work";
  nodes: KnowledgeNode[];
  notes: Note[];
  selectedPage: KnowledgePage | null;
  onSelectPage: (id: string) => void;
  onCreateFolder: (input: KnowledgeFolderInput) => Promise<void>;
  onCreatePage: (input: KnowledgePageInput) => Promise<void>;
  onUpdatePage: (page: KnowledgePage) => Promise<void>;
  onMovePageSpace: (page: KnowledgePage, space: ContentSpace) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onMoveFolder: (id: string, parentId: string | null) => Promise<void>;
  onMoveFolderSpace: (node: KnowledgeNode, space: ContentSpace) => Promise<unknown>;
  onDeletePage: (page: KnowledgePage) => Promise<void>;
  onDeleteFolder: (node: KnowledgeNode) => Promise<void>;
  onImportNote: (noteId: string, parentId: string | null, moveSource: boolean) => Promise<void>;
  onRestoreVersion: (versionId: string) => Promise<void>;
  onOpenTarget: (id: string, kind: string) => void;
  preferences?: UserPreferences;
  onPreferencesChange?: (preferences: UserPreferences) => void;
}

export function KnowledgeBasePage({
  space,
  createSpace,
  nodes,
  notes,
  selectedPage,
  onSelectPage,
  onCreateFolder,
  onCreatePage,
  onUpdatePage,
  onMovePageSpace,
  onRenameFolder,
  onMoveFolder,
  onMoveFolderSpace,
  onDeletePage,
  onDeleteFolder,
  onImportNote,
  onRestoreVersion,
  onOpenTarget,
  preferences,
  onPreferencesChange,
}: KnowledgeBasePageProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [zenMode, setZenMode] = useState(false);

  // Modals state
  const [modal, setModal] = useState<"page" | "folder" | "import" | null>(null);
  const [modalParentId, setModalParentId] = useState<string | null>(null);
  const [moveFolder, setMoveFolder] = useState<KnowledgeNode | null>(null);
  const [movePage, setMovePage] = useState<KnowledgeNode | null>(null);
  const [renameFolder, setRenameFolder] = useState<KnowledgeNode | null>(null);
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<KnowledgeNode | null>(null);
  const [deletePageConfirm, setDeletePageConfirm] = useState<KnowledgePage | null>(null);

  // Unsaved changes guard
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const saveTriggerRef = useRef<(() => void) | null>(null);

  const folders = useMemo(
    () => nodes.filter((node) => node.kind === "folder"),
    [nodes]
  );
  const visibleNotes = useMemo(
    () => notes.filter((note) => note.space === createSpace),
    [createSpace, notes]
  );
  const displaySpace =
    space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间";

  // Build a folder path map for displaying nested options
  const folderPathOptions = useMemo(() => {
    return folders
      .filter((f) => f.space === createSpace)
      .map((f) => ({
        id: f.id,
        path: getFolderPath(f.id, folders),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [folders, createSpace]);

  // Expand all folders containing search matches
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;

    const matchedFolderIds = new Set<string>();
    nodes.forEach((node) => {
      if (node.title.toLowerCase().includes(q)) {
        let parent = node.parentId;
        while (parent) {
          matchedFolderIds.add(parent);
          const pNode = nodes.find((n) => n.id === parent);
          parent = pNode ? pNode.parentId : null;
        }
      }
    });

    if (matchedFolderIds.size > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        matchedFolderIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [searchQuery, nodes]);

  const toggleFolder = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(folders.map((f) => f.id)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  const handleSelectPage = (id: string) => {
    if (selectedPage?.id === id) return;
    if (isEditorDirty) {
      setPendingSelectId(id);
      return;
    }
    onSelectPage(id);
  };

  const handleConfirmSaveAndSwitch = () => {
    if (saveTriggerRef.current) {
      saveTriggerRef.current();
    }
    const target = pendingSelectId;
    setPendingSelectId(null);
    if (target) onSelectPage(target);
  };

  const handleDiscardAndSwitch = () => {
    const target = pendingSelectId;
    setPendingSelectId(null);
    setIsEditorDirty(false);
    if (target) onSelectPage(target);
  };

  const openCreatePageInFolder = (folderId: string | null) => {
    setModalParentId(folderId);
    setModal("page");
    if (folderId) {
      setExpanded((current) => new Set(current).add(folderId));
    }
  };

  const openCreateSubfolder = (folderId: string | null) => {
    setModalParentId(folderId);
    setModal("folder");
    if (folderId) {
      setExpanded((current) => new Set(current).add(folderId));
    }
  };

  // Filter root nodes or search matches
  const q = searchQuery.trim().toLowerCase();
  const rootNodes = nodes.filter((node) => node.parentId === null);

  const renderNode = (node: KnowledgeNode, depth = 0): React.ReactNode => {
    const children = nodes.filter((child) => child.parentId === node.id);
    const isFolder = node.kind === "folder";
    const isOpen = expanded.has(node.id);
    const isMatched = q ? node.title.toLowerCase().includes(q) : true;

    // If searching, hide branch if neither it nor any children match
    if (q && !isMatched && !hasMatchingDescendant(node.id, nodes, q)) {
      return null;
    }

    return (
      <div className="knowledge-tree-branch" key={node.id}>
        <div
          className={
            "knowledge-tree-row " +
            node.kind +
            (selectedPage?.id === node.id ? " is-selected" : "") +
            (q && isMatched ? " is-search-match" : "")
          }
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          {isFolder ? (
            <button
              type="button"
              className="tree-toggle"
              onClick={() => toggleFolder(node.id)}
              aria-label={isOpen ? "收起目录" : "展开目录"}
              title={isOpen ? "收起目录" : "展开目录"}
            >
              {isOpen ? "⌄" : "›"}
            </button>
          ) : (
            <span className="tree-toggle-spacer" />
          )}

          <button
            type="button"
            className="knowledge-node-button"
            onClick={() => (isFolder ? toggleFolder(node.id) : handleSelectPage(node.id))}
          >
            <span className="knowledge-node-icon">{isFolder ? "📁" : "📄"}</span>
            <span>{node.title || "无标题"}</span>
          </button>

          <span className="tree-actions">
            {isFolder ? (
              <>
                <button
                  type="button"
                  title="在此目录下新建页面"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCreatePageInFolder(node.id);
                  }}
                >
                  ＋页
                </button>
                <button
                  type="button"
                  title="新建子目录"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCreateSubfolder(node.id);
                  }}
                >
                  ＋目
                </button>
                <button
                  type="button"
                  title="移动目录"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoveFolder(node);
                  }}
                >
                  ↗
                </button>
                <SpaceMoveButton space={node.space} onMove={(nextSpace) => onMoveFolderSpace(node, nextSpace)} />
                <button
                  type="button"
                  title="重命名目录"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameFolder(node);
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="danger"
                  title="删除目录"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteFolderConfirm(node);
                  }}
                >
                  ×
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  title="移动所属目录"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMovePage(node);
                  }}
                >
                  ↗
                </button>
                <button
                  type="button"
                  className="danger"
                  title="删除页面"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedPage?.id === node.id) {
                      setDeletePageConfirm(selectedPage);
                    } else {
                      // Fetch placeholder page info for deletion
                      setDeletePageConfirm({
                        id: node.id,
                        title: node.title,
                        content: "",
                        parentId: node.parentId,
                        space: node.space,
                        tags: [],
                        favorite: false,
                        archived: false,
                        createdAt: "",
                        updatedAt: "",
                        deviceId: "",
                        workspaceId: "",
                        revision: 1,
                      });
                    }
                  }}
                >
                  ×
                </button>
              </>
            )}
          </span>
        </div>

        {isFolder && isOpen ? (
          <div className="knowledge-tree-children">
            {children.map((child) => renderNode(child, depth + 1))}
            {children.length === 0 ? (
              <div
                className="tree-empty"
                style={{ paddingLeft: 38 + depth * 16 }}
              >
                空目录 ·{" "}
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => openCreatePageInFolder(node.id)}
                >
                  新建页面
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`page-stack knowledge-page ${zenMode ? "is-zen-active" : ""}`}>
      <PageHeader
        eyebrow="连接你的知识"
        title="知识库"
        description={`${displaySpace} · 用结构化目录管理知识，用 [[双链]] 构建知识网络`}
        action={
          <div className="knowledge-header-actions">
            <Button
              type="button"
              variant={zenMode ? "primary" : "secondary"}
              onClick={() => setZenMode(!zenMode)}
              title={zenMode ? "退出全屏专注模式" : "全屏专注写作模式"}
            >
              {zenMode ? "退出专注" : "专注模式"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModal("import")}
            >
              从笔记导入
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => openCreateSubfolder(null)}
            >
              ＋ 新建目录
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => openCreatePageInFolder(null)}
            >
              ＋ 新建页面
            </Button>
          </div>
        }
      />

      {/* Unsaved Changes Confirmation Modal */}
      {pendingSelectId && (
        <DialogLayer onClose={() => setPendingSelectId(null)}>
          <div className="modal-card confirm-modal-card">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">提示</span>
                <h2>未保存的页面修改</h2>
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
                当前知识页面有未保存的修改，切换页面将丢失这些修改。请选择：
              </p>
            </div>
            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPendingSelectId(null)}
              >
                留在当前页面
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

      <div className={`knowledge-layout ${zenMode ? "zen-layout" : ""}`}>
        {!zenMode && (
          <section className="knowledge-tree-panel list-panel">
            <div className="list-panel-heading">
              <div className="heading-actions">
                <span>{nodes.length} 个节点</span>
                <span className="muted">
                  ({nodes.filter((n) => n.kind === "page").length} 篇页面)
                </span>
              </div>
              <div className="tree-header-controls">
                <button
                  type="button"
                  className="tree-ctrl-btn"
                  onClick={expandAll}
                  title="展开所有目录"
                >
                  全部展开
                </button>
                <button
                  type="button"
                  className="tree-ctrl-btn"
                  onClick={collapseAll}
                  title="折叠所有目录"
                >
                  全部折叠
                </button>
              </div>
            </div>

            {/* Tree Search Box */}
            <div className="knowledge-search-bar">
              <span className="search-symbol">🔍</span>
              <input
                type="text"
                placeholder="搜索知识页面或目录..."
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

            <div className="knowledge-tree">
              {rootNodes.length === 0 ? (
                <EmptyState size="compact">
                  <span>⌘</span>
                  <p>还没有知识页面</p>
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => openCreatePageInFolder(null)}
                  >
                    创建第一页 →
                  </Button>
                </EmptyState>
              ) : (
                rootNodes.map((node) => renderNode(node))
              )}
            </div>
          </section>
        )}

        <section className="knowledge-editor-panel list-panel">
          {selectedPage ? (
            <KnowledgeEditor
              key={selectedPage.id}
              page={selectedPage}
              folders={folders}
              folderPathOptions={folderPathOptions}
              allPages={nodes.filter((n) => n.kind === "page")}
              onUpdate={onUpdatePage}
              onMovePageSpace={onMovePageSpace}
              onDelete={() => setDeletePageConfirm(selectedPage)}
              onRestoreVersion={onRestoreVersion}
              onOpenTarget={onOpenTarget}
              onSelectPage={onSelectPage}
              onDirtyChange={setIsEditorDirty}
              registerSaveTrigger={(fn) => {
                saveTriggerRef.current = fn;
              }}
              preferences={preferences}
              onPreferencesChange={onPreferencesChange}
            />
          ) : (
            <EmptyState size="placeholder" className="editor-placeholder">
              <div className="placeholder-glyph">⌘</div>
              <h3>选择一个知识页面</h3>
              <p>
                用目录分层组织知识，用 <code>[[页面标题]]</code>{" "}
                建立网状双向关联。
              </p>
              <div className="placeholder-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => openCreateSubfolder(null)}
                >
                  ＋ 新建目录
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => openCreatePageInFolder(null)}
                >
                  ＋ 新建知识页面
                </Button>
              </div>
            </EmptyState>
          )}
        </section>
      </div>

      {/* Modal: New Page */}
      {modal === "page" ? (
        <KnowledgePageModal
          space={createSpace}
          initialParentId={modalParentId}
          folderOptions={folderPathOptions}
          onClose={() => {
            setModal(null);
            setModalParentId(null);
          }}
          onSave={async (input) => {
            await onCreatePage(input);
            setModal(null);
            setModalParentId(null);
          }}
        />
      ) : null}

      {/* Modal: New Folder */}
      {modal === "folder" ? (
        <KnowledgeFolderModal
          space={createSpace}
          initialParentId={modalParentId}
          folderOptions={folderPathOptions}
          onClose={() => {
            setModal(null);
            setModalParentId(null);
          }}
          onSave={async (input) => {
            await onCreateFolder(input);
            setModal(null);
            setModalParentId(null);
          }}
        />
      ) : null}

      {/* Modal: Import Note */}
      {modal === "import" ? (
        <ImportNoteModal
          space={createSpace}
          notes={visibleNotes}
          folderOptions={folderPathOptions}
          onClose={() => setModal(null)}
          onSave={async (noteId, parentId, moveSource) => {
            await onImportNote(noteId, parentId, moveSource);
            setModal(null);
          }}
        />
      ) : null}

      {/* Modal: Move Folder */}
      {moveFolder ? (
        <KnowledgeMoveFolderModal
          folder={moveFolder}
          folders={folders}
          folderOptions={folderPathOptions}
          onClose={() => setMoveFolder(null)}
          onSave={async (parentId) => {
            await onMoveFolder(moveFolder.id, parentId);
            setMoveFolder(null);
          }}
        />
      ) : null}

      {/* Modal: Move Page */}
      {movePage ? (
        <KnowledgeMovePageModal
          pageNode={movePage}
          folderOptions={folderPathOptions}
          onClose={() => setMovePage(null)}
          onSave={async (parentId) => {
            // Find full page object or update via page
            if (selectedPage?.id === movePage.id) {
              await onUpdatePage({ ...selectedPage, parentId });
            } else {
              // Create page update
              const pageToUpdate: KnowledgePage = {
                id: movePage.id,
                title: movePage.title,
                content: "",
                parentId,
                space: movePage.space,
                tags: [],
                favorite: false,
                archived: false,
                createdAt: "",
                updatedAt: "",
                deviceId: "",
                workspaceId: "",
                revision: 1,
              };
              await onUpdatePage(pageToUpdate);
            }
            setMovePage(null);
          }}
        />
      ) : null}

      {/* Modal: Rename Folder */}
      {renameFolder ? (
        <KnowledgeRenameFolderModal
          folder={renameFolder}
          onClose={() => setRenameFolder(null)}
          onSave={async (newName) => {
            await onRenameFolder(renameFolder.id, newName);
            setRenameFolder(null);
          }}
        />
      ) : null}

      {/* Modal: Delete Folder Confirmation */}
      {deleteFolderConfirm ? (
        <KnowledgeDeleteFolderModal
          folder={deleteFolderConfirm}
          descendantCount={getDescendantCount(deleteFolderConfirm.id, nodes)}
          onClose={() => setDeleteFolderConfirm(null)}
          onConfirm={async () => {
            await onDeleteFolder(deleteFolderConfirm);
            setDeleteFolderConfirm(null);
          }}
        />
      ) : null}

      {/* Modal: Delete Page Confirmation */}
      {deletePageConfirm ? (
        <KnowledgeDeletePageModal
          pageTitle={deletePageConfirm.title}
          onClose={() => setDeletePageConfirm(null)}
          onConfirm={async () => {
            await onDeletePage(deletePageConfirm);
            setDeletePageConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// KnowledgeEditor Component
// ----------------------------------------------------------------------

interface KnowledgeEditorProps {
  page: KnowledgePage;
  folders: KnowledgeNode[];
  folderPathOptions: { id: string; path: string }[];
  allPages: KnowledgeNode[];
  onUpdate: (page: KnowledgePage) => Promise<void>;
  onMovePageSpace: (page: KnowledgePage, space: ContentSpace) => Promise<void>;
  onDelete: () => void;
  onRestoreVersion: (versionId: string) => Promise<void>;
  onOpenTarget: (id: string, kind: string) => void;
  onSelectPage: (id: string) => void;
  onDirtyChange: (isDirty: boolean) => void;
  registerSaveTrigger: (fn: () => void) => void;
  preferences?: UserPreferences;
  onPreferencesChange?: (preferences: UserPreferences) => void;
}

function KnowledgeEditor({
  page,
  folderPathOptions,
  allPages,
  onUpdate,
  onMovePageSpace,
  onDelete,
  onRestoreVersion,
  onOpenTarget,
  onSelectPage,
  onDirtyChange,
  registerSaveTrigger,
  preferences,
  onPreferencesChange,
}: KnowledgeEditorProps) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [tags, setTags] = useState(page.tags.join(" "));
  const [parentId, setParentId] = useState(page.parentId ?? "");
  const [mode, setMode] = useState<"edit" | "split" | "preview">("split");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "just-saved">("saved");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [wikiLinkModalOpen, setWikiLinkModalOpen] = useState(false);
  const [autoSaveMenuOpen, setAutoSaveMenuOpen] = useState(false);
  const [saveRecordsModalOpen, setSaveRecordsModalOpen] = useState(false);
  const [saveRecordTrigger, setSaveRecordTrigger] = useState(0);

  const autoSaveEnabled = preferences?.autoSaveEnabled ?? true;
  const autoSaveIntervalSeconds = preferences?.autoSaveIntervalSeconds ?? 15;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync editor draft when page revision changes
  const prevRevisionRef = useRef(page.revision);
  useEffect(() => {
    if (page.revision !== prevRevisionRef.current) {
      prevRevisionRef.current = page.revision;
      setTitle((curr) => (curr === page.title ? curr : page.title));
      setContent((curr) => (curr === page.content ? curr : page.content));
      setTags((curr) => (curr === page.tags.join(" ") ? curr : page.tags.join(" ")));
      setParentId((curr) => (curr === (page.parentId ?? "") ? curr : (page.parentId ?? "")));
    }
  }, [page.revision, page.title, page.content, page.tags, page.parentId]);

  const isDirty = useMemo(() => {
    return (
      title !== page.title ||
      content !== page.content ||
      tags !== page.tags.join(" ") ||
      parentId !== (page.parentId ?? "")
    );
  }, [title, content, tags, parentId, page]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2200);
  }, []);

  const executeSave = useCallback(
    (type: SaveType = "manual") => {
      setSaveStatus("saving");
      const nextRevision = (page.revision || 0) + 1;
      recordSaveType(`${page.id}_rev_${nextRevision}`, type);

      const updatedPage: KnowledgePage = {
        ...page,
        title: title.trim() || "无标题页面",
        content,
        tags: parseTags(tags),
        parentId: parentId || null,
      };

      addLocalSaveRecord({
        id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        entityId: page.id,
        entityKind: "knowledge_page",
        title: updatedPage.title,
        content: updatedPage.content,
        createdAt: new Date().toISOString(),
        revision: nextRevision,
        saveType: type,
        charCount: updatedPage.content.length,
        lineCount: updatedPage.content ? updatedPage.content.split("\n").length : 0,
        wordCount: updatedPage.content.trim().split(/\s+/).filter(Boolean).length,
      });

      void onUpdate(updatedPage).finally(() => {
        setSaveRecordTrigger((c) => c + 1);
        markSaved(type);
        setSaveStatus("just-saved");
        if (type === "manual") {
          showToast("✓ 知识页面已保存并记录版本");
        }
        setTimeout(() => setSaveStatus("saved"), 1800);
      });
    },
    [page, title, content, tags, parentId, onUpdate, showToast]
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
    entityId: page.id,
  });

  useEffect(() => {
    registerSaveTrigger(() => executeSave("manual"));
  }, [executeSave, registerSaveTrigger]);

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
      const replacement = `\`\`\`ts\n${selected || "// 知识代码块"}\n\`\`\`\n`;
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

  const handleWikiLinkButtonClick = () => {
    const textarea = textareaRef.current;
    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      // If user selected text, wrap it immediately into [[selectedText]]
      applyEdit((t, s) => wrapText(t, s, "[[", "]]", "知识页面"));
    } else {
      // If no text selected, open quick page picker modal
      setWikiLinkModalOpen(true);
    }
  };

  const insertWikiLinkPage = (targetTitle: string) => {
    applyEdit((t, s) => {
      const link = `[[${targetTitle}]]`;
      return {
        newText: t.slice(0, s.start) + link + t.slice(s.end),
        newSelection: {
          start: s.start + link.length,
          end: s.start + link.length,
        },
      };
    });
    setWikiLinkModalOpen(false);
  };

  const formatTable = () => {
    applyEdit((t, s) => {
      const table =
        "\n| 属性 | 说明 | 示例 |\n| :--- | :--- | :--- |\n| 参数 1 | 描述 1 | 值 1 |\n| 参数 2 | 描述 2 | 值 2 |\n";
      return {
        newText: t.slice(0, s.start) + table + t.slice(s.end),
        newSelection: {
          start: s.start + table.length,
          end: s.start + table.length,
        },
      };
    });
  };

  const formatDivider = () => {
    applyEdit((t, s) => {
      const hr = "\n---\n";
      return {
        newText: t.slice(0, s.start) + hr + t.slice(s.end),
        newSelection: { start: s.start + hr.length, end: s.start + hr.length },
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier && e.key.toLowerCase() === "s") {
      e.preventDefault();
      executeSave("manual");
      return;
    }
    if (modifier && e.key.toLowerCase() === "b") {
      e.preventDefault();
      formatBold();
      return;
    }
    if (modifier && e.key.toLowerCase() === "i") {
      e.preventDefault();
      formatItalic();
      return;
    }
    if (modifier && e.key.toLowerCase() === "k") {
      e.preventDefault();
      formatLink();
      return;
    }
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

  const handleToggleTaskItem = (lineIndex: number, checked: boolean) => {
    const lines = content.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    lines[lineIndex] = lines[lineIndex].replace(
      /^(\s*[-*+]\s+\[)[ xX](\]\s*.*)$/,
      `$1${checked ? "x" : " "}$2`
    );
    setContent(lines.join("\n"));
  };

  const copyMarkdown = () => {
    void navigator.clipboard.writeText(content).then(() => {
      showToast("✓ 已复制知识库 Markdown");
    });
  };

  const copyPlainText = () => {
    const plain = content.replace(/[*#>`~_\[\]()]/g, "").trim();
    void navigator.clipboard.writeText(plain).then(() => {
      showToast("✓ 已复制纯文本");
    });
  };

  const exportMarkdown = () => {
    const fullText = `# ${title || "无标题页面"}\n\n${content}`;
    const blob = new Blob([fullText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "知识页面"}.md`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("✓ 已导出为 .md 文件");
  };

  const discardEdits = () => {
    setTitle(page.title);
    setContent(page.content);
    setTags(page.tags.join(" "));
    setParentId(page.parentId ?? "");
    showToast("已撤销当前未保存的修改");
  };

  const handleWikiLinkClick = (targetTitle: string) => {
    const matched = allPages.find(
      (p) => p.title.toLowerCase() === targetTitle.toLowerCase()
    );
    if (matched) {
      onSelectPage(matched.id);
    } else {
      onOpenTarget(targetTitle, "knowledge_page");
    }
  };

  const stats = useMemo(() => getMarkdownStats(content), [content]);

  return (
    <div className="knowledge-editor note-editor">
      {/* Editor Toolbar */}
      <div className="editor-toolbar">
        <div className="editor-mode-tabs">
          <button
            type="button"
            className={mode === "edit" ? "is-active" : ""}
            onClick={() => setMode("edit")}
          >
            编辑
          </button>
          <button
            type="button"
            className={mode === "split" ? "is-active" : ""}
            onClick={() => setMode("split")}
          >
            双栏对照
          </button>
          <button
            type="button"
            className={mode === "preview" ? "is-active" : ""}
            onClick={() => setMode("preview")}
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
              title="复制 Markdown"
            >
              复制
            </Button>
            <Button
              type="button"
              size="small" variant="subtle"
              onClick={exportMarkdown}
              title="导出 Markdown 文件"
            >
              导出
            </Button>
          </div>

          {isDirty && (
            <Button
              type="button"
              size="small" variant="subtle"
              onClick={discardEdits}
            >
              重置
            </Button>
          )}

          <SpaceMoveButton space={page.space} onMove={(nextSpace) => onMovePageSpace({ ...page, title: title.trim() || "无标题页面", content, tags: parseTags(tags), parentId: parentId || null }, nextSpace)} />
          <Button
            type="button"
            size="small" variant="danger"
            onClick={onDelete}
          >
            删除
          </Button>

          <Button
            type="button"
            variant="primary" className={`compact ${isDirty ? "highlight-pulse" : ""}`}
            onClick={() => executeSave("manual")}
            title="手动保存页面 (Ctrl+S / Cmd+S)"
          >
            {saveStatus === "saving" ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {/* Markdown Format Toolbar */}
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
              title="加粗 (Ctrl+B)"
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
              title="引用 (> )"
            >
              ”
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatBulletList}
              title="列表 (- )"
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
              title="插入超链接 (Ctrl+K)"
            >
              🔗 链接
            </button>
            <button
              type="button"
              className="fmt-btn fmt-btn-wikilink"
              onClick={handleWikiLinkButtonClick}
              title="插入或关联双链页面 ([[ ]])"
            >
              [[双链]]
            </button>
            <button
              type="button"
              className="fmt-btn"
              onClick={formatTable}
              title="插入结构化表格"
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
              title="插入当前时间"
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

      {/* Main Editing / Viewing Container */}
      <div className="editor-main-container">
        {mode === "edit" && (
          <div className="editor-form">
            <TextField
              className="note-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="无标题知识页面"
            />
            <TextArea
              ref={textareaRef}
              className="note-content-input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="# 从这里开始&#10;&#10;使用 [[页面标题]] 连接网状知识。&#10;快捷键：Ctrl+S 保存，Tab 缩进。"
            />
            <div className="editor-meta">
              <label>
                标签
                <TextField
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="#研究  #架构  #规范"
                />
              </label>
              <label>
                所属目录
                <SelectField
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">📁 根目录</option>
                  {folderPathOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      📁 {item.path}
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
                placeholder="无标题知识页面"
              />
              <TextArea
                ref={textareaRef}
                className="note-content-input"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="# 从这里开始&#10;&#10;左侧编辑 Markdown 与 [[双链]]，右侧实时对照。&#10;快捷键：Ctrl+S 保存。"
              />
              <div className="editor-meta">
                <label>
                  标签
                  <TextField
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="#研究  #方法"
                  />
                </label>
                <label>
                  所属目录
                  <SelectField
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                  >
                    <option value="">📁 根目录</option>
                    {folderPathOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        📁 {item.path}
                      </option>
                    ))}
                  </SelectField>
                </label>
              </div>
            </div>

            <div className="editor-split-right">
              <div className="preview-wrap">
                <h2>{title || "无标题知识页面"}</h2>
                <MarkdownPreview
                  content={content}
                  onToggleTaskItem={handleToggleTaskItem}
                  onWikiLinkClick={handleWikiLinkClick}
                />
              </div>
            </div>
          </div>
        )}

        {mode === "preview" && (
          <div className="preview-wrap preview-full">
            <h2>{title || "无标题知识页面"}</h2>
            <MarkdownPreview
              content={content}
              onToggleTaskItem={handleToggleTaskItem}
              onWikiLinkClick={handleWikiLinkClick}
            />
            <div className="preview-footer">
              <span>最后编辑于 {formatRelative(page.updatedAt)}</span>
              <span>
                {stats.characters} 字符 · 预计阅读时间约 {stats.readingTimeMinutes}{" "}
                分钟
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Editor Stats Footer */}
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
        entityId={page.id}
        entityKind="knowledge_page"
        entityTitle={title}
        currentContent={content}
        onRestore={async (versionId) => {
          await onRestoreVersion(versionId);
          setSaveRecordTrigger((c) => c + 1);
        }}
        refreshTrigger={saveRecordTrigger}
      />

      {/* Modal for selecting a WikiLink to insert */}
      {wikiLinkModalOpen && (
        <WikiLinkPickerModal
          pages={allPages.filter((p) => p.id !== page.id)}
          onClose={() => setWikiLinkModalOpen(false)}
          onSelect={(target) => insertWikiLinkPage(target)}
        />
      )}

      {/* Panels */}
      <BacklinksPanel
        id={page.id}
        kind="knowledge_page"
        onOpen={onOpenTarget}
      />
      <VersionHistoryPanel
        id={page.id}
        kind="knowledge_page"
        currentContent={page.content}
        onRestore={onRestoreVersion}
        refreshTrigger={saveRecordTrigger}
        onOpenRecordsModal={() => setSaveRecordsModalOpen(true)}
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// Modals
// ----------------------------------------------------------------------

function WikiLinkPickerModal({
  pages,
  onClose,
  onSelect,
}: {
  pages: KnowledgeNode[];
  onClose: () => void;
  onSelect: (title: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [customTitle, setCustomTitle] = useState("");

  const filteredPages = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.title.toLowerCase().includes(q));
  }, [pages, filter]);

  return (
    <ModalFrame title="插入知识双链 [[...]]" onClose={onClose}>
      <div>
        <label>
          搜索已有页面
          <TextField
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="输入页面标题检索..."
          />
        </label>

        <div className="wikilink-picker-list">
          {filteredPages.length === 0 ? (
            <p className="wikilink-empty-text">
              未找到匹配的页面
            </p>
          ) : (
            filteredPages.slice(0, 8).map((p) => (
              <button
                key={p.id}
                type="button"
                className="wikilink-picker-item"
                onClick={() => onSelect(p.title)}
              >
                <span>📄</span>
                <strong>{p.title || "无标题页面"}</strong>
              </button>
            ))
          )}
        </div>

        <div className="wikilink-custom-section">
          <label>
            或关联新页面（未创建页面）
            <div className="wikilink-input-row">
              <TextField
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="例如：新技术构想"
              />
              <Button
                type="button"
                variant="primary" className="compact"
                disabled={!customTitle.trim()}
                onClick={() => onSelect(customTitle.trim())}
              >
                插入
              </Button>
            </div>
          </label>
        </div>
      </div>
    </ModalFrame>
  );
}

function KnowledgePageModal({
  space,
  initialParentId,
  folderOptions,
  onClose,
  onSave,
}: {
  space: "personal" | "work";
  initialParentId: string | null;
  folderOptions: { id: string; path: string }[];
  onClose: () => void;
  onSave: (input: KnowledgePageInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("页面标题不能为空");
      return;
    }
    await onSave({
      title: title.trim(),
      content,
      parentId: parentId || null,
      space,
    });
  };

  return (
    <ModalFrame
      title="新建知识页面"
      onClose={onClose}
      actions={<ModalActions formId="knowledge-page-form" onClose={onClose} />}
    >
      <form id="knowledge-page-form" onSubmit={submit}>
        <label>
          页面标题
          <TextField
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：架构设计原则"
          />
        </label>
        <label>
          所属目录
          <SelectField
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">📁 根目录</option>
            {folderOptions.map((item) => (
              <option key={item.id} value={item.id}>
                📁 {item.path}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          正文（Markdown）
          <TextArea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={7}
            placeholder="# 从这里开始&#10;&#10;支持 Markdown 结构、表格与 [[双链]]。"
          />
        </label>
        {error ? <div className="form-error">{error}</div> : null}
      </form>
    </ModalFrame>
  );
}

function KnowledgeFolderModal({
  space,
  initialParentId,
  folderOptions,
  onClose,
  onSave,
}: {
  space: "personal" | "work";
  initialParentId: string | null;
  folderOptions: { id: string; path: string }[];
  onClose: () => void;
  onSave: (input: KnowledgeFolderInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("目录名称不能为空");
      return;
    }
    await onSave({
      name: name.trim(),
      parentId: parentId || null,
      space,
    });
  };

  return (
    <ModalFrame
      title="新建知识目录"
      onClose={onClose}
      actions={<ModalActions formId="knowledge-folder-form" onClose={onClose} />}
    >
      <form id="knowledge-folder-form" onSubmit={submit}>
        <label>
          目录名称
          <TextField
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：系统架构"
          />
        </label>
        <label>
          上级目录
          <SelectField
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">📁 根目录</option>
            {folderOptions.map((item) => (
              <option key={item.id} value={item.id}>
                📁 {item.path}
              </option>
            ))}
          </SelectField>
        </label>
        {error ? <div className="form-error">{error}</div> : null}
      </form>
    </ModalFrame>
  );
}

function KnowledgeMoveFolderModal({
  folder,
  folders,
  folderOptions,
  onClose,
  onSave,
}: {
  folder: KnowledgeNode;
  folders: KnowledgeNode[];
  folderOptions: { id: string; path: string }[];
  onClose: () => void;
  onSave: (parentId: string | null) => Promise<void>;
}) {
  const [parentId, setParentId] = useState(folder.parentId ?? "");

  // Prevent moving a folder inside itself or its descendants
  const validOptions = folderOptions.filter(
    (item) =>
      item.id !== folder.id && !isDescendant(item.id, folder.id, folders)
  );

  return (
    <ModalFrame
      title={`移动目录 “${folder.title}”`}
      onClose={onClose}
      actions={<ModalActions formId="knowledge-move-folder-form" onClose={onClose} />}
    >
      <form
        id="knowledge-move-folder-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(parentId || null);
        }}
      >
        <label>
          目标父目录
          <SelectField
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">📁 根目录</option>
            {validOptions.map((item) => (
              <option key={item.id} value={item.id}>
                📁 {item.path}
              </option>
            ))}
          </SelectField>
        </label>
        <p className="field-hint">该目录下的所有页面和子目录将一并移至目标位置。</p>
      </form>
    </ModalFrame>
  );
}

function KnowledgeMovePageModal({
  pageNode,
  folderOptions,
  onClose,
  onSave,
}: {
  pageNode: KnowledgeNode;
  folderOptions: { id: string; path: string }[];
  onClose: () => void;
  onSave: (parentId: string | null) => Promise<void>;
}) {
  const [parentId, setParentId] = useState(pageNode.parentId ?? "");

  return (
    <ModalFrame
      title={`移动页面 “${pageNode.title}”`}
      onClose={onClose}
      actions={<ModalActions formId="knowledge-move-page-form" onClose={onClose} />}
    >
      <form
        id="knowledge-move-page-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(parentId || null);
        }}
      >
        <label>
          目标归属目录
          <SelectField
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">📁 根目录</option>
            {folderOptions.map((item) => (
              <option key={item.id} value={item.id}>
                📁 {item.path}
              </option>
            ))}
          </SelectField>
        </label>
      </form>
    </ModalFrame>
  );
}

function KnowledgeRenameFolderModal({
  folder,
  onClose,
  onSave,
}: {
  folder: KnowledgeNode;
  onClose: () => void;
  onSave: (newName: string) => Promise<void>;
}) {
  const [name, setName] = useState(folder.title);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("目录名称不能为空");
      return;
    }
    await onSave(name.trim());
  };

  return (
    <ModalFrame
      title={`重命名目录 “${folder.title}”`}
      onClose={onClose}
      actions={<ModalActions formId="knowledge-rename-folder-form" onClose={onClose} />}
    >
      <form id="knowledge-rename-folder-form" onSubmit={submit}>
        <label>
          新目录名称
          <TextField
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error ? <div className="form-error">{error}</div> : null}
      </form>
    </ModalFrame>
  );
}

function KnowledgeDeleteFolderModal({
  folder,
  descendantCount,
  onClose,
  onConfirm,
}: {
  folder: KnowledgeNode;
  descendantCount: { folders: number; pages: number };
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ModalFrame
      title={`删除目录 “${folder.title}”`}
      eyebrow="删除确认"
      cardClassName="confirm-modal-card"
      onClose={onClose}
      actions={
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
          <Button type="button" variant="danger" onClick={onConfirm}>确认删除</Button>
        </div>
      }
    >
      <>
        <p className="confirm-modal-body">
          确定要删除目录 <strong>“{folder.title}”</strong> 吗？
        </p>
        {descendantCount.folders > 0 || descendantCount.pages > 0 ? (
          <div className="form-error confirm-warning">
            ⚠️ 警告：该目录下包含 <strong>{descendantCount.folders}</strong> 个子目录和{" "}
            <strong>{descendantCount.pages}</strong> 篇知识页面，删除目录将一并删除它们！
          </div>
        ) : (
          <div className="confirm-modal-tip">
            💡 提示：当前目录为空目录，删除后不可直接恢复。
          </div>
        )}
      </>
    </ModalFrame>
  );
}

function KnowledgeDeletePageModal({
  pageTitle,
  onClose,
  onConfirm,
}: {
  pageTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ModalFrame
      title="删除知识页面"
      eyebrow="删除确认"
      cardClassName="confirm-modal-card"
      onClose={onClose}
      actions={
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
          <Button type="button" variant="danger" onClick={onConfirm}>确认删除</Button>
        </div>
      }
    >
      <p className="confirm-modal-body">
        确定要删除知识页面 <strong>“{pageTitle}”</strong> 吗？删除后可在回收站找回。
      </p>
    </ModalFrame>
  );
}

function ImportNoteModal({
  space,
  notes,
  folderOptions,
  onClose,
  onSave,
}: {
  space: "personal" | "work";
  notes: Note[];
  folderOptions: { id: string; path: string }[];
  onClose: () => void;
  onSave: (noteId: string, parentId: string | null, moveSource: boolean) => Promise<void>;
}) {
  const [noteId, setNoteId] = useState(notes[0]?.id ?? "");
  const [parentId, setParentId] = useState("");
  const [moveSource, setMoveSource] = useState(false);

  return (
    <ModalFrame
      title="从笔记导入知识库"
      onClose={onClose}
      actions={<ModalActions formId="knowledge-import-note-form" onClose={onClose} disabled={!noteId} />}
    >
      <form
        id="knowledge-import-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (noteId) void onSave(noteId, parentId || null, moveSource);
        }}
      >
        <label>
          选择笔记
          <SelectField
            value={noteId}
            onChange={(event) => setNoteId(event.target.value)}
          >
            {notes.length === 0 ? (
              <option value="">没有可导入的笔记</option>
            ) : (
              notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title || "无标题笔记"}
                </option>
              ))
            )}
          </SelectField>
        </label>
        <label>
          目标目录
          <SelectField
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">📁 根目录</option>
            {folderOptions.map((item) => (
              <option key={item.id} value={item.id}>
                📁 {item.path}
              </option>
            ))}
          </SelectField>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={moveSource}
            onChange={(event) => setMoveSource(event.target.checked)}
          />
          导入后将原笔记移入回收站（移动）
        </label>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({
  title,
  eyebrow = "知识库",
  cardClassName = "knowledge-modal",
  onClose,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  cardClassName?: string;
  onClose: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogLayer onClose={onClose}>
      <div className={`modal-card ${cardClassName}`}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <IconButton
            type="button"
            className="close-button"
            onClick={onClose}
            label="关闭"
          >
            ×
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {actions}
      </div>
    </DialogLayer>
  );
}

function ModalActions({
  onClose,
  disabled = false,
  formId,
}: {
  onClose: () => void;
  disabled?: boolean;
  formId?: string;
}) {
  return (
    <div className="modal-actions">
      <Button type="button" variant="secondary" onClick={onClose}>
        取消
      </Button>
      <Button type="submit" form={formId} variant="primary" disabled={disabled}>
        保存
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------

function getFolderPath(folderId: string, folders: KnowledgeNode[]): string {
  const parts: string[] = [];
  let curr: KnowledgeNode | undefined = folders.find((f) => f.id === folderId);
  const visited = new Set<string>();
  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    parts.unshift(curr.title || "未命名目录");
    if (!curr.parentId) break;
    curr = folders.find((f) => f.id === curr?.parentId);
  }
  return parts.join(" / ");
}

function isDescendant(
  candidateId: string,
  ancestorId: string,
  folders: KnowledgeNode[]
) {
  const visited = new Set<string>();
  let current = folders.find((folder) => folder.id === candidateId);
  while (current?.parentId) {
    if (!visited.add(current.id)) return true;
    if (current.parentId === ancestorId) return true;
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return false;
}

function hasMatchingDescendant(
  folderId: string,
  nodes: KnowledgeNode[],
  query: string
): boolean {
  const children = nodes.filter((n) => n.parentId === folderId);
  for (const child of children) {
    if (child.title.toLowerCase().includes(query)) return true;
    if (child.kind === "folder" && hasMatchingDescendant(child.id, nodes, query)) {
      return true;
    }
  }
  return false;
}

function getDescendantCount(
  folderId: string,
  nodes: KnowledgeNode[]
): { folders: number; pages: number } {
  let folderCount = 0;
  let pageCount = 0;
  const queue = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = nodes.filter((n) => n.parentId === currentId);
    for (const child of children) {
      if (child.kind === "folder") {
        folderCount++;
        queue.push(child.id);
      } else {
        pageCount++;
      }
    }
  }

  return { folders: folderCount, pages: pageCount };
}
