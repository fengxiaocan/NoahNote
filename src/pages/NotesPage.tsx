import { useEffect, useState } from "react";
import type { Note, Project, Space } from "../types";
import { formatRelative, parseTags } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { BacklinksPanel } from "../components/BacklinksPanel";
import { VersionHistoryPanel } from "../components/VersionHistoryPanel";
import type { CreateKind } from "../components/Modal";

interface NotesPageProps {
  space: Space;
  notes: Note[];
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (note: Note) => void;
  onToggleFavorite: (note: Note) => void;
  onArchive: (note: Note) => void;
  onDelete: (note: Note) => void;
  onAttach: (note: Note) => void;
  onImport: () => void | Promise<void>;
  onRestoreVersion: (versionId: string) => Promise<void>;
  onOpenTarget: (id: string, kind: string) => void;
}

export function NotesPage({ space, notes, projects, selectedId, onSelect, onCreate, onUpdate, onToggleFavorite, onArchive, onDelete, onAttach, onImport, onRestoreVersion, onOpenTarget }: NotesPageProps) {
  const [showFavorites, setShowFavorites] = useState(false);
  const visibleNotes = showFavorites ? notes.filter((note) => note.favorite) : notes;
  const selected = visibleNotes.find((note) => note.id === selectedId) ?? null;
  return (
    <div className="page-stack notes-page">
      <PageHeader eyebrow="记录与思考" title="笔记" description={`${notes.length} 篇 Markdown 笔记 · 用空间、项目和标签找到它们`} action={<><button className="button secondary" onClick={() => void onImport()}>导入 Markdown</button><button className="button primary" onClick={() => onCreate("note")}>＋ 新建笔记</button></>} />
      <div className="notes-workspace">
        <section className="notes-list-panel"><div className="notes-list-heading"><span>{showFavorites ? "我的收藏" : "最近编辑"}</span><button className="small-button" onClick={() => setShowFavorites((current) => !current)}>{showFavorites ? "全部" : "收藏"}</button></div>{visibleNotes.length === 0 ? <div className="compact-empty"><span>▤</span><p>{showFavorites ? "还没有收藏笔记" : "还没有笔记"}</p><button className="text-button" onClick={() => onCreate("note")}>{showFavorites ? "写一篇并收藏 →" : "写一篇 →"}</button></div> : <div className="notes-list">{visibleNotes.map((note) => <div className="note-list-row" key={note.id}><button className={`note-list-item ${note.id === selectedId ? "is-selected" : ""}`} onClick={() => onSelect(note.id)}><span className="note-symbol">▤</span><span className="note-list-copy"><strong>{note.title || "无标题笔记"}</strong><small>{note.content.replace(/[#>*`\n]/g, " ").slice(0, 74) || "暂无正文"}</small><time>{formatRelative(note.updatedAt)}</time></span></button><button className="favorite-toggle" aria-label={note.favorite ? "取消收藏" : "收藏"} title={note.favorite ? "取消收藏" : "收藏"} onClick={() => onToggleFavorite(note)}>{note.favorite ? "★" : "☆"}</button></div>)}</div>}</section>
        <section className="note-editor-panel">{selected ? <NoteEditor note={selected} projects={projects} onUpdate={onUpdate} onToggleFavorite={onToggleFavorite} onArchive={onArchive} onDelete={onDelete} onAttach={onAttach} onRestoreVersion={onRestoreVersion} onOpenTarget={onOpenTarget} /> : <div className="editor-placeholder"><div className="placeholder-glyph">✎</div><h3>选择一篇笔记</h3><p>从左侧打开内容，或新建一篇 Markdown 笔记。</p><button className="button secondary" onClick={() => onCreate("note")}>新建笔记</button></div>}</section>
      </div>
    </div>
  );
}

function NoteEditor({ note, projects, onUpdate, onToggleFavorite, onArchive, onDelete, onAttach, onRestoreVersion, onOpenTarget }: { note: Note; projects: Project[]; onUpdate: (note: Note) => void; onToggleFavorite: (note: Note) => void; onArchive: (note: Note) => void; onDelete: (note: Note) => void; onAttach: (note: Note) => void; onRestoreVersion: (versionId: string) => Promise<void>; onOpenTarget: (id: string, kind: string) => void }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState(note.tags.join(" "));
  const [projectId, setProjectId] = useState(note.projectId ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  useEffect(() => { setTitle(note.title); setContent(note.content); setTags(note.tags.join(" ")); setProjectId(note.projectId ?? ""); setMode("edit"); }, [note.id, note.title, note.content, note.tags, note.projectId]);
  const save = () => onUpdate({ ...note, title: title.trim() || "无标题笔记", content, tags: parseTags(tags), projectId: projectId || null });
  return <div className="note-editor"><div className="editor-toolbar"><div className="editor-mode-tabs"><button className={mode === "edit" ? "is-active" : ""} onClick={() => setMode("edit")}>编辑</button><button className={mode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")}>预览</button></div><div className="editor-actions"><span className="save-hint">Markdown · 保存时生成版本</span><button className="small-button subtle" onClick={() => onToggleFavorite(note)}>{note.favorite ? "取消收藏" : "收藏"}</button><button className="small-button subtle" onClick={() => onAttach(note)}>添加附件</button><button className="small-button subtle" onClick={() => onArchive(note)}>归档</button><button className="small-button subtle danger" onClick={() => onDelete(note)}>删除</button><button className="button primary compact" onClick={save}>保存</button></div></div>{mode === "edit" ? <div className="editor-form"><input className="note-title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="无标题笔记" /><textarea className="note-content-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder="# 从这里开始\n\n支持 Markdown 标题、列表、引用和代码块。" /><div className="editor-meta"><label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="#Android  #研究" /></label><label>项目<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">不关联项目</option>{projects.filter((project) => project.space === note.space).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div></div> : <div className="preview-wrap"><h2>{title || "无标题笔记"}</h2><MarkdownPreview content={content} /><div className="preview-footer">最后编辑于 {formatRelative(note.updatedAt)}</div></div>}<BacklinksPanel id={note.id} kind="note" onOpen={onOpenTarget} /><VersionHistoryPanel id={note.id} kind="note" currentContent={note.content} onRestore={onRestoreVersion} /></div>;
}
