import { useEffect, useMemo, useState } from "react";
import type { Project, Space, Task, TaskPriority, TaskStatus } from "../types";
import { formatDate, parseTags, priorityLabel, statusLabel } from "../lib/format";
import { sortTasks, type TaskSort } from "../lib/tasks";
import { PageHeader } from "../components/PageHeader";
import type { CreateKind } from "../components/Modal";

interface TasksPageProps {
  space: Space;
  tasks: Task[];
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (task: Task) => void | Promise<unknown>;
  onArchive: (task: Task) => void | Promise<unknown>;
  onDelete: (task: Task) => Promise<void>;
  onImport: () => void | Promise<void>;
}

type Filter = "all" | "todo" | "in_progress" | "done";

export function TasksPage({ space, tasks, projects, selectedId, onSelect, onCreate, onUpdate, onArchive, onDelete, onImport }: TasksPageProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<TaskSort>("due_date");
  const [editingId, setEditingId] = useState<string | null>(null);
  const visibleTasks = useMemo(() => sortTasks(tasks.filter((task) => filter === "all" || task.status === filter), sort), [filter, sort, tasks]);
  const activeCount = tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const cycleStatus = (task: Task) => void onUpdate({ ...task, status: task.status === "done" ? "todo" : "done" });
  const openEditor = (task: Task) => {
    onSelect(task.id);
    setEditingId(task.id);
  };

  useEffect(() => {
    if (!selectedId || !tasks.some((task) => task.id === selectedId)) return;
    setEditingId(selectedId);
    document.getElementById(`task-${selectedId}`)?.scrollIntoView({ block: "center" });
  }, [selectedId, tasks]);

  const editing = editingId ? tasks.find((task) => task.id === editingId) ?? null : null;
  const closeEditor = () => {
    setEditingId(null);
    onSelect(null);
  };

  return (
    <div className="page-stack narrow-page">
      <PageHeader eyebrow="清晰的下一步" title="任务" description={activeCount + " 件进行中 · " + doneCount + " 件已完成"} action={<><button className="button secondary" onClick={() => void onImport()}>导入任务</button><button className="button primary" onClick={() => onCreate("task")}>＋ 新建任务</button></>} />
      <div className="task-toolbar"><div className="filter-tabs">{([["all", "全部"], ["todo", "待处理"], ["in_progress", "进行中"], ["done", "已完成"]] as const).map(([value, label]) => <button className={filter === value ? "is-active" : ""} key={value} onClick={() => setFilter(value)}>{label}<span>{value === "all" ? tasks.length : tasks.filter((task) => task.status === value).length}</span></button>)}</div><div className="task-toolbar-actions"><label className="task-sort-control">排序<select aria-label="任务排序" value={sort} onChange={(event) => setSort(event.target.value as TaskSort)}><option value="due_date">截止日期</option><option value="priority">优先级</option><option value="updated_at">最近更新</option><option value="title">标题</option></select></label><button className="view-toggle" title="看板视图即将支持">☷ 列表视图</button></div></div>
      <section className="list-panel task-list-panel">
        <div className="list-panel-heading"><span>{visibleTasks.length} 件任务</span><span className="muted">点击任务编辑，点击圆圈完成任务</span></div>
        {visibleTasks.length === 0 ? <div className="large-empty"><div className="large-empty-icon">✓</div><h3>这里还没有任务</h3><p>把目标拆成一个个清晰的下一步。</p><button className="button secondary" onClick={() => onCreate("task")}>新建任务</button></div> : <div className="task-list">{visibleTasks.map((task) => <article id={`task-${task.id}`} className={`task-row ${task.status === "done" ? "is-done" : ""} ${task.id === selectedId ? "is-selected" : ""}`} key={task.id} onClick={() => openEditor(task)}><button className={`check-circle ${task.status === "done" ? "checked" : ""}`} onClick={(event) => { event.stopPropagation(); cycleStatus(task); }} aria-label={task.status === "done" ? "标记为未完成" : "标记为完成"}>{task.status === "done" ? "✓" : ""}</button><div className="task-row-content"><strong>{task.title}</strong>{task.description ? <p>{task.description}</p> : null}<div className="item-meta"><span className={`status-pill ${task.status}`}>{statusLabel[task.status]}</span><span className={`priority-label ${task.priority}`}>{priorityLabel[task.priority]}</span>{task.dueDate ? <span>截止 {formatDate(task.dueDate)}</span> : <span>无截止日期</span>}{task.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div></div><div className="task-row-actions"><button className="small-button subtle" onClick={(event) => { event.stopPropagation(); openEditor(task); }}>编辑</button><button className="small-button subtle" onClick={(event) => { event.stopPropagation(); void onArchive(task); }}>归档</button><button className="more-button" title="删除任务" onClick={(event) => { event.stopPropagation(); void onDelete(task); }}>×</button></div></article>)}</div>}
      </section>
      {editing ? <TaskEditor task={editing} projects={projects} tasks={tasks} onClose={closeEditor} onUpdate={async (task) => { await onUpdate(task); closeEditor(); }} onArchive={async (task) => { await onArchive(task); closeEditor(); }} /> : null}
    </div>
  );
}

function TaskEditor({ task, projects, tasks, onClose, onUpdate, onArchive }: { task: Task; projects: Project[]; tasks: Task[]; onClose: () => void; onUpdate: (task: Task) => Promise<void>; onArchive: (task: Task) => Promise<void> }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [parentId, setParentId] = useState(task.parentId ?? "");
  const [tags, setTags] = useState(task.tags.join(" "));
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setPriority(task.priority);
    setDueDate(task.dueDate ?? "");
    setProjectId(task.projectId ?? "");
    setParentId(task.parentId ?? "");
    setTags(task.tags.join(" "));
    setError("");
  }, [task]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("任务标题不能为空");
      return;
    }
    setError("");
    try {
      await onUpdate({ ...task, title: title.trim(), description, status, priority, dueDate: dueDate || null, projectId: projectId || null, parentId: parentId || null, tags: parseTags(tags) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const archive = async () => {
    try {
      await onArchive(task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal-card" onSubmit={(event) => void submit(event)}><div className="modal-heading"><div><span className="eyebrow">任务编辑</span><h2>编辑任务</h2></div><button type="button" className="close-button" onClick={onClose} aria-label="关闭">×</button></div><label>标题<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} placeholder="补充完成任务所需的背景和步骤" /></label><div className="form-grid"><label>状态<select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}><option value="todo">待处理</option><option value="in_progress">进行中</option><option value="waiting">等待</option><option value="done">已完成</option><option value="cancelled">已取消</option></select></label><label>优先级<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="urgent">紧急</option><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label></div><div className="form-grid"><label>截止日期<input type="date" value={dueDate} onChange={(event) => { setDueDate(event.target.value); event.currentTarget.blur(); }} /></label><label>所属项目<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">不关联项目</option>{projects.filter((project) => project.space === task.space && !project.archived).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div><label>父任务<select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">无父任务</option>{tasks.filter((candidate) => candidate.id !== task.id && candidate.space === task.space && !candidate.archived).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label><label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="#重要  #待研究" /></label>{error ? <div className="form-error">{error}</div> : null}<div className="modal-actions"><button type="button" className="small-button subtle danger" onClick={() => void archive()}>归档</button><span /><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary">保存</button></div></form></div>;
}
