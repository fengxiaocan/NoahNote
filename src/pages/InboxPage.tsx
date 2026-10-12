import { Button, DialogLayer, IconButton, TextArea, TextField, EmptyState } from "../components/ui";
import { useEffect, useState } from "react";
import type { InboxItem, Space } from "../types";
import { formatRelative } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import type { CreateKind } from "../components/Modal";

interface InboxPageProps {
  space: Space;
  items: InboxItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (item: InboxItem) => void | Promise<unknown>;
  onArchive: (item: InboxItem) => void;
  onDelete: (item: InboxItem) => Promise<void>;
  onMove: (item: InboxItem, space: "personal" | "work") => void;
  onPromote: (item: InboxItem, target: "note" | "task") => void;
}

const kindLabels: Record<InboxItem["kind"], string> = { note: "笔记", task: "任务", memo: "备忘", checklist: "清单", spark: "灵光" };

export function InboxPage({ space, items, selectedId, onSelect, onCreate, onUpdate, onArchive, onDelete, onMove, onPromote }: InboxPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const selectedItem = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  useEffect(() => {
    if (!selectedItem) return;
    setEditingId(selectedItem.id);
    document.getElementById(`inbox-${selectedItem.id}`)?.scrollIntoView({ block: "center" });
  }, [selectedItem]);
  const editing = editingId ? items.find((item) => item.id === editingId) ?? null : null;
  const closeEditor = () => {
    setEditingId(null);
    onSelect(null);
  };

  return (
    <div className="page-stack narrow-page">
      <PageHeader eyebrow="先记录，再整理" title="收件箱" description={(space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间") + " · 暂时不知道放哪里的内容，都可以先放在这里"} action={<Button variant="primary" onClick={() => onCreate("inbox")}>＋ 快速记录</Button>} />
      <div className="inbox-callout"><span className="callout-icon">▣</span><div><strong>不用在记录时做分类决定</strong><p>把想法、链接和临时任务先放进来，稍后再移动到正确的位置。</p></div></div>
      <section className="list-panel">
        <div className="list-panel-heading"><span>{items.length} 条待整理内容</span><span className="muted">按创建时间排序</span></div>
        {items.length === 0 ? <EmptyState size="large"><div className="large-empty-icon">✦</div><h3>收件箱是空的</h3><p>有新的想法时，按下快速记录即可。</p><Button variant="secondary" onClick={() => onCreate("inbox")}>记录一条内容</Button></EmptyState> : <div className="inbox-list">{items.map((item) => <article id={`inbox-${item.id}`} className={`inbox-item ${item.id === selectedId ? "is-selected" : ""}`} key={item.id} onClick={() => { onSelect(item.id); setEditingId(item.id); }}><div className="inbox-item-main"><span className={`item-type ${item.kind}`}>{kindLabels[item.kind]}</span><h3>{item.title}</h3>{item.body ? <p>{item.body}</p> : null}<div className="item-meta"><span>{item.space === "personal" ? "个人" : "工作"}</span><time>{formatRelative(item.createdAt)}</time>{item.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div></div><div className="inbox-item-actions"><Button size="small" variant="secondary" onClick={(event) => { event.stopPropagation(); onSelect(item.id); setEditingId(item.id); }}>编辑</Button>{item.space !== "personal" ? <Button size="small" variant="secondary" onClick={(event) => { event.stopPropagation(); onMove(item, "personal"); }}>移到个人</Button> : null}{item.space !== "work" ? <Button size="small" variant="secondary" onClick={(event) => { event.stopPropagation(); onMove(item, "work"); }}>移到工作</Button> : null}<Button size="small" variant="secondary" onClick={(event) => { event.stopPropagation(); onPromote(item, "task"); }}>转为任务</Button><Button size="small" variant="secondary" onClick={(event) => { event.stopPropagation(); onPromote(item, "note"); }}>转为笔记</Button><Button size="small" variant="subtle" onClick={(event) => { event.stopPropagation(); onArchive(item); }}>归档</Button><Button size="small" variant="danger" onClick={(event) => { event.stopPropagation(); void onDelete(item); }}>删除</Button></div></article>)}</div>}
      </section>
      {editing ? <InboxEditor item={editing} onClose={closeEditor} onUpdate={async (item) => { await onUpdate(item); closeEditor(); }} /> : null}
    </div>
  );
}

function InboxEditor({ item, onClose, onUpdate }: { item: InboxItem; onClose: () => void; onUpdate: (item: InboxItem) => Promise<void> }) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [error, setError] = useState("");
  useEffect(() => { setTitle(item.title); setBody(item.body); setError(""); }, [item]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError("收件箱标题不能为空"); return; }
    try {
      setError("");
      await onUpdate({ ...item, title: title.trim(), body });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return <DialogLayer onClose={onClose}><form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="inbox-editor-title" onSubmit={(event) => void submit(event)}><div className="modal-heading"><div><span className="eyebrow">收件箱编辑</span><h2 id="inbox-editor-title">编辑记录</h2></div><IconButton className="close-button" label="关闭" onClick={onClose}>×</IconButton></div><label>标题<TextField autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>内容<TextArea value={body} onChange={(event) => setBody(event.target.value)} rows={8} placeholder="补充记录内容" /></label>{error ? <div className="form-error">{error}</div> : null}<div className="modal-actions"><span /><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button type="submit" variant="primary">保存</Button></div></form></DialogLayer>;
}
