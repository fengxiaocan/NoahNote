import { Button, DialogLayer, Field, IconButton, SegmentButton, SegmentedControl, SelectField, TextArea, TextField, EmptyState } from "../components/ui";
import { useEffect, useMemo, useState } from "react";
import type { KnowledgeFolderInput, KnowledgePageInput } from "../lib/api";
import { parseTags } from "../lib/format";
import { BacklinksPanel } from "../components/BacklinksPanel";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import { useAppDialogs } from "../components/AppDialogs";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel";
import type { ContentSpace, KnowledgeNode, KnowledgePage, Note, Space } from "../types";

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
}: KnowledgeBasePageProps) {
  const { confirm, prompt } = useAppDialogs();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<"page" | "folder" | "import" | null>(null);
  const [moveFolder, setMoveFolder] = useState<KnowledgeNode | null>(null);
  const folders = useMemo(() => nodes.filter((node) => node.kind === "folder"), [nodes]);
  const visibleNotes = useMemo(() => notes.filter((note) => note.space === createSpace), [createSpace, notes]);
  const rootNodes = nodes.filter((node) => node.parentId === null);
  const displaySpace = space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间";

  const toggleFolder = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const renderNode = (node: KnowledgeNode, depth = 0): React.ReactNode => {
    const children = nodes.filter((child) => child.parentId === node.id);
    const isFolder = node.kind === "folder";
    const isOpen = expanded.has(node.id);
    return <div className="knowledge-tree-branch" key={node.id}>
      <div className={"knowledge-tree-row " + node.kind + (selectedPage?.id === node.id ? " is-selected" : "")} style={{ paddingLeft: 12 + depth * 18 }}>
        {isFolder ? <button className="tree-toggle" onClick={() => toggleFolder(node.id)} aria-label={isOpen ? "收起目录" : "展开目录"}>{isOpen ? "⌄" : "›"}</button> : <span className="tree-toggle-spacer" />}
        <button className="knowledge-node-button" onClick={() => isFolder ? toggleFolder(node.id) : onSelectPage(node.id)}>
          <span className="knowledge-node-icon">{isFolder ? "▾" : "▤"}</span><span>{node.title || "无标题"}</span>
        </button>
        {isFolder ? <span className="tree-actions"><button title="新建页面" aria-label="新建页面" onClick={() => { setModal("page"); setExpanded((current) => new Set(current).add(node.id)); }}>＋</button><button title="移动目录" aria-label="移动目录" onClick={() => setMoveFolder(node)}>↗</button><SpaceMoveButton space={node.space} onMove={(nextSpace) => onMoveFolderSpace(node, nextSpace)} /><button title="重命名" aria-label="重命名目录" onClick={async () => { const name = await prompt({ title: "重命名目录", message: "目录名称", initialValue: node.title, placeholder: "输入目录名称", confirmLabel: "保存" }); if (name?.trim()) void onRenameFolder(node.id, name.trim()); }}>✎</button><button className="danger" title="删除目录" aria-label="删除目录" onClick={async () => { if (await confirm({ title: "删除目录", message: `删除目录“${node.title}”及其内容？`, confirmLabel: "删除目录", tone: "danger" })) void onDeleteFolder(node); }}>×</button></span> : null}
      </div>
      {isFolder && isOpen ? <div className="knowledge-tree-children">{children.map((child) => renderNode(child, depth + 1))}{children.length === 0 ? <div className="tree-empty" style={{ paddingLeft: 42 + depth * 18 }}>空目录</div> : null}</div> : null}
    </div>;
  };

  return <div className="page-stack knowledge-page">
    <PageHeader eyebrow="连接你的知识" title="知识库" description={displaySpace + " · 页面、目录和双向链接集中在这里"} action={<div className="knowledge-header-actions"><Button variant="secondary" onClick={() => setModal("import")}>从笔记导入</Button><Button variant="secondary" onClick={() => setModal("folder")}>＋ 新建目录</Button><Button variant="primary" onClick={() => setModal("page")}>＋ 新建页面</Button></div>} />
    <div className="knowledge-layout">
      <section className="knowledge-tree-panel list-panel">
        <div className="list-panel-heading"><span>{nodes.length} 个节点</span><span className="muted">目录树</span></div>
        <div className="knowledge-tree">{rootNodes.length === 0 ? <EmptyState size="compact"><span>⌘</span><p>还没有知识页面</p><Button variant="subtle" onClick={() => setModal("page")}>创建第一页 →</Button></EmptyState> : rootNodes.map((node) => renderNode(node))}</div>
      </section>
      <section className="knowledge-editor-panel list-panel">{selectedPage ? <KnowledgeEditor page={selectedPage} folders={folders} onUpdate={onUpdatePage} onMoveSpace={onMovePageSpace} onDelete={async () => { if (await confirm({ title: "删除知识页面", message: `删除页面“${selectedPage.title}”？`, confirmLabel: "删除页面", tone: "danger" })) void onDeletePage(selectedPage); }} onRestoreVersion={onRestoreVersion} onOpenTarget={onOpenTarget} /> : <EmptyState size="placeholder" className="editor-placeholder"><div className="placeholder-glyph">⌘</div><h3>选择一个知识页面</h3><p>用目录组织长期知识，用 <code>[[页面标题]]</code> 建立关联。</p><Button variant="secondary" onClick={() => setModal("page")}>新建知识页面</Button></EmptyState>}</section>
    </div>
    {modal === "page" ? <KnowledgePageModal space={createSpace} folders={folders} onClose={() => setModal(null)} onSave={async (input) => { await onCreatePage(input); setModal(null); }} /> : null}
    {modal === "folder" ? <KnowledgeFolderModal space={createSpace} folders={folders} onClose={() => setModal(null)} onSave={async (input) => { await onCreateFolder(input); setModal(null); }} /> : null}
    {modal === "import" ? <ImportNoteModal space={createSpace} notes={visibleNotes} folders={folders} onClose={() => setModal(null)} onSave={async (noteId, parentId, moveSource) => { await onImportNote(noteId, parentId, moveSource); setModal(null); }} /> : null}
    {moveFolder ? <KnowledgeMoveFolderModal folder={moveFolder} folders={folders} onClose={() => setMoveFolder(null)} onSave={async (parentId) => { await onMoveFolder(moveFolder.id, parentId); setMoveFolder(null); }} /> : null}
  </div>;
}

function KnowledgeEditor({ page, folders, onUpdate, onMoveSpace, onDelete, onRestoreVersion, onOpenTarget }: { page: KnowledgePage; folders: KnowledgeNode[]; onUpdate: (page: KnowledgePage) => Promise<void>; onMoveSpace: (page: KnowledgePage, space: ContentSpace) => Promise<void>; onDelete: () => void; onRestoreVersion: (versionId: string) => Promise<void>; onOpenTarget: (id: string, kind: string) => void }) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [tags, setTags] = useState(page.tags.join(" "));
  const [parentId, setParentId] = useState(page.parentId ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  useEffect(() => { setTitle(page.title); setContent(page.content); setTags(page.tags.join(" ")); setParentId(page.parentId ?? ""); setMode("edit"); }, [page.id, page.title, page.content, page.tags, page.parentId]);
  const save = () => void onUpdate({ ...page, title: title.trim() || "无标题页面", content, tags: parseTags(tags), parentId: parentId || null });
  return <div className="knowledge-editor"><div className="editor-toolbar"><SegmentedControl className="editor-mode-tabs" label="知识页面编辑模式"><SegmentButton selected={mode === "edit"} onClick={() => setMode("edit")}>编辑</SegmentButton><SegmentButton selected={mode === "preview"} onClick={() => setMode("preview")}>预览</SegmentButton></SegmentedControl><div className="editor-actions"><span className="save-hint">保存时生成版本 · 支持 [[双链]]</span><SpaceMoveButton space={page.space} onMove={(nextSpace) => onMoveSpace({ ...page, title: title.trim() || "无标题页面", content, tags: parseTags(tags), parentId: null }, nextSpace)} /><Button size="small" variant="danger" onClick={onDelete}>删除</Button><Button variant="primary" className="compact" onClick={save}>保存</Button></div></div>{mode === "edit" ? <div className="editor-form"><TextField className="note-title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="无标题页面" /><TextArea className="note-content-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder="# 从这里开始\n\n使用 [[页面标题]] 连接知识。" /><div className="editor-meta"><Field label="标签"><TextField value={tags} onChange={(event) => setTags(event.target.value)} placeholder="#研究  #方法" /></Field><Field label="所属目录"><SelectField value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">根目录</option>{folders.filter((folder) => folder.id !== page.id && folder.space === page.space).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</SelectField></Field></div></div> : <div className="preview-wrap"><h2>{title || "无标题页面"}</h2><MarkdownPreview content={content} /><div className="preview-footer">最后编辑于 {page.updatedAt}</div></div>}<BacklinksPanel id={page.id} kind="knowledge_page" onOpen={onOpenTarget} /><VersionHistoryPanel id={page.id} kind="knowledge_page" currentContent={page.content} onRestore={onRestoreVersion} /></div>;
}

function KnowledgePageModal({ space, folders, onClose, onSave }: { space: "personal" | "work"; folders: KnowledgeNode[]; onClose: () => void; onSave: (input: KnowledgePageInput) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [parentId, setParentId] = useState(""); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!title.trim()) { setError("页面标题不能为空"); return; } await onSave({ title: title.trim(), content, parentId: parentId || null, space }); };
  return <ModalFrame title="新建知识页面" onClose={onClose}><form onSubmit={submit}><label>标题<TextField autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：发布流程" /></label><label>所属目录<SelectField value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">根目录</option>{folders.filter((folder) => folder.space === space).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</SelectField></label><label>正文<TextArea value={content} onChange={(event) => setContent(event.target.value)} rows={8} placeholder="支持 Markdown 与 [[双链]]" /></label>{error ? <div className="form-error">{error}</div> : null}<ModalActions onClose={onClose} /></form></ModalFrame>;
}

function KnowledgeFolderModal({ space, folders, onClose, onSave }: { space: "personal" | "work"; folders: KnowledgeNode[]; onClose: () => void; onSave: (input: KnowledgeFolderInput) => Promise<void> }) {
  const [name, setName] = useState(""); const [parentId, setParentId] = useState(""); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!name.trim()) { setError("目录名称不能为空"); return; } await onSave({ name: name.trim(), parentId: parentId || null, space }); };
  return <ModalFrame title="新建知识目录" onClose={onClose}><form onSubmit={submit}><label>目录名称<TextField autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：工程实践" /></label><label>上级目录<SelectField value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">根目录</option>{folders.filter((folder) => folder.space === space).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</SelectField></label>{error ? <div className="form-error">{error}</div> : null}<ModalActions onClose={onClose} /></form></ModalFrame>;
}

function KnowledgeMoveFolderModal({ folder, folders, onClose, onSave }: { folder: KnowledgeNode; folders: KnowledgeNode[]; onClose: () => void; onSave: (parentId: string | null) => Promise<void> }) {
  const [parentId, setParentId] = useState(folder.parentId ?? "");
  const candidates = folders.filter((candidate) => candidate.space === folder.space && candidate.id !== folder.id && !isDescendant(candidate.id, folder.id, folders));
  return <ModalFrame title={`移动目录“${folder.title}”`} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); void onSave(parentId || null); }}><label>目标父目录<SelectField value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">根目录</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</SelectField></label><p className="field-hint">目录下的页面和子目录会一起移动。</p><ModalActions onClose={onClose} /></form></ModalFrame>;
}

function ImportNoteModal({ space, notes, folders, onClose, onSave }: { space: "personal" | "work"; notes: Note[]; folders: KnowledgeNode[]; onClose: () => void; onSave: (noteId: string, parentId: string | null, moveSource: boolean) => Promise<void> }) {
  const [noteId, setNoteId] = useState(notes[0]?.id ?? ""); const [parentId, setParentId] = useState(""); const [moveSource, setMoveSource] = useState(false);
  return <ModalFrame title="从笔记导入知识库" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (noteId) void onSave(noteId, parentId || null, moveSource); }}><label>选择笔记<SelectField value={noteId} onChange={(event) => setNoteId(event.target.value)}>{notes.length === 0 ? <option value="">没有可导入的笔记</option> : notes.map((note) => <option key={note.id} value={note.id}>{note.title || "无标题笔记"}</option>)}</SelectField></label><label>目标目录<SelectField value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">根目录</option>{folders.filter((folder) => folder.space === space).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</SelectField></label><label className="checkbox-label"><input type="checkbox" checked={moveSource} onChange={(event) => setMoveSource(event.target.checked)} />导入后移入回收站（移动）</label><ModalActions onClose={onClose} disabled={!noteId} /></form></ModalFrame>;
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <DialogLayer onClose={onClose}><div className="modal-card knowledge-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-modal-title"><div className="modal-heading"><div><span className="eyebrow">知识库</span><h2 id="knowledge-modal-title">{title}</h2></div><IconButton className="close-button" label="关闭" onClick={onClose}>×</IconButton></div>{children}</div></DialogLayer>; }
function ModalActions({ onClose, disabled = false }: { onClose: () => void; disabled?: boolean }) { return <div className="modal-actions"><span /><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button type="submit" variant="primary" disabled={disabled}>保存</Button></div>; }

function isDescendant(candidateId: string, ancestorId: string, folders: KnowledgeNode[]) {
  const visited = new Set<string>();
  let current = folders.find((folder) => folder.id === candidateId);
  while (current?.parentId) {
    if (!visited.add(current.id)) return true;
    if (current.parentId === ancestorId) return true;
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return false;
}
