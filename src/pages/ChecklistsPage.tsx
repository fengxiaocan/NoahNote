import { useEffect, useState } from "react";
import type { Checklist, ChecklistItem, Space } from "../types";
import { PageHeader } from "../components/PageHeader";
import type { CreateKind } from "../components/Modal";

interface ChecklistsPageProps {
  space: Space;
  checklists: Checklist[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (checklist: Checklist) => void;
  onArchive: (checklist: Checklist) => void;
  onDelete: (checklist: Checklist) => Promise<void>;
}

export function ChecklistsPage({ space, checklists, selectedId, onSelect, onCreate, onUpdate, onArchive, onDelete }: ChecklistsPageProps) {
  const selected = checklists.find((checklist) => checklist.id === selectedId) ?? checklists[0] ?? null;
  const completed = selected?.items.filter((item) => item.completed).length ?? 0;
  return <div className="page-stack checklists-page"><PageHeader eyebrow="一步一步完成" title="Checklist" description={(space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间") + " · 把重复流程变成清晰的清单"} action={<button className="button primary" onClick={() => onCreate("checklist")}>＋ 新建清单</button>} /><div className="checklists-layout"><section className="list-panel checklist-list-panel"><div className="list-panel-heading"><span>{checklists.length} 份清单</span><span className="muted">点击打开</span></div>{checklists.length === 0 ? <div className="large-empty"><div className="large-empty-icon">☑</div><h3>还没有 Checklist</h3><p>把发布、测试或出行步骤保存下来。</p><button className="button secondary" onClick={() => onCreate("checklist")}>创建清单</button></div> : <div className="checklist-list">{checklists.map((checklist) => { const done = checklist.items.filter((item) => item.completed).length; return <button className={"checklist-list-item " + (selected?.id === checklist.id ? "is-selected" : "")} key={checklist.id} onClick={() => onSelect(checklist.id)}><span className="checklist-icon">☑</span><span><strong>{checklist.title}</strong><small>{done}/{checklist.items.length || 0} 项完成</small></span></button>; })}</div>}</section>{selected ? <ChecklistEditor checklist={selected} completed={completed} onUpdate={onUpdate} onArchive={onArchive} onDelete={onDelete} /> : <div className="project-detail-placeholder"><div className="placeholder-glyph">☑</div><h3>选择一份清单</h3><p>从左侧打开，开始逐项完成。</p></div>}</div></div>;
}

function ChecklistEditor({ checklist, completed, onUpdate, onArchive, onDelete }: { checklist: Checklist; completed: number; onUpdate: (checklist: Checklist) => void; onArchive: (checklist: Checklist) => void; onDelete: (checklist: Checklist) => Promise<void> }) {
  const [title, setTitle] = useState(checklist.title);
  const [description, setDescription] = useState(checklist.description);
  const [items, setItems] = useState(checklist.items);
  const [newItem, setNewItem] = useState("");
  useEffect(() => { setTitle(checklist.title); setDescription(checklist.description); setItems(checklist.items); }, [checklist.id, checklist.title, checklist.description, checklist.items]);
  const updateItem = (index: number, update: Partial<ChecklistItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  const addItem = () => { const text = newItem.trim(); if (!text) return; setItems((current) => [...current, { id: crypto.randomUUID(), text, completed: false, position: current.length }]); setNewItem(""); };
  const moveItem = (index: number, direction: -1 | 1) => setItems((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next.map((item, itemIndex) => ({ ...item, position: itemIndex })); });
  const save = () => onUpdate({ ...checklist, title: title.trim() || checklist.title, description, items: items.map((item, index) => ({ ...item, position: index })) });
  return <section className="checklist-editor list-panel"><div className="checklist-editor-heading"><div><span className="card-kicker">{completed}/{items.length} 已完成</span><h2>编辑清单</h2></div><div className="editor-actions"><button className="small-button subtle" onClick={() => onArchive(checklist)}>归档</button><button className="small-button subtle danger" onClick={() => void onDelete(checklist)}>删除</button><button className="button primary compact" onClick={save}>保存</button></div></div><input className="checklist-title-input" value={title} onChange={(event) => setTitle(event.target.value)} /><textarea className="checklist-description-input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="给这份清单加一点说明" rows={3} /><div className="checklist-items">{items.map((item, index) => <div className={"checklist-row " + (item.completed ? "is-complete" : "")} key={item.id}><button className={"check-circle " + (item.completed ? "checked" : "")} onClick={() => updateItem(index, { completed: !item.completed })} aria-label={item.completed ? "取消完成" : "标记完成"}>{item.completed ? "✓" : ""}</button><input value={item.text} onChange={(event) => updateItem(index, { text: event.target.value })} /><div className="checklist-row-actions"><button onClick={() => moveItem(index, -1)} title="上移">↑</button><button onClick={() => moveItem(index, 1)} title="下移">↓</button><button onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} title="删除">×</button></div></div>)}</div><div className="checklist-add-row"><input value={newItem} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} placeholder="添加一项，按 Enter 确认" /><button className="button secondary" onClick={addItem}>添加</button></div></section>;
}
