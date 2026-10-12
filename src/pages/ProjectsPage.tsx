import { Button, SelectField, TextArea, TextField, EmptyState } from "../components/ui";
import { useEffect, useState } from "react";
import type { Project, Space, Task, Note } from "../types";
import { formatRelative, projectStatusLabel } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import type { CreateKind } from "../components/Modal";
import type { ContentSpace } from "../types";

interface ProjectsPageProps {
  space: Space;
  projects: Project[];
  tasks: Task[];
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (project: Project) => void;
  onArchive: (project: Project) => void;
  onMoveSpace: (project: Project, space: ContentSpace) => void | Promise<unknown>;
  onDelete: (project: Project) => Promise<void>;
}

export function ProjectsPage({ space, projects, tasks, notes, selectedId, onSelect, onCreate, onUpdate, onArchive, onMoveSpace, onDelete }: ProjectsPageProps) {
  const selected = projects.find((project) => project.id === selectedId) ?? null;
  return <div className="page-stack"><PageHeader eyebrow="上下文工作" title="项目" description={projects.length + " 个项目 · 把任务、笔记和进度放在一起"} action={<Button variant="primary" onClick={() => onCreate("project")}>＋ 新建项目</Button>} /><div className="projects-layout"><section className="project-grid">{projects.length === 0 ? <EmptyState size="large" className="project-empty"><div className="large-empty-icon">◆</div><h3>从一个项目开始</h3><p>项目会成为任务和笔记的共同上下文。</p><Button variant="secondary" onClick={() => onCreate("project")}>创建项目</Button></EmptyState> : projects.map((project) => <button className={"project-card " + (project.id === selectedId ? "is-selected" : "")} key={project.id} onClick={() => onSelect(project.id)}><div className="project-card-top"><span className={"project-status-dot " + project.status} /><span>{projectStatusLabel[project.status]}</span><span className="project-menu">···</span></div><h3>{project.name}</h3><p>{project.description || "还没有项目描述"}</p><div className="project-card-bottom"><span>{tasks.filter((task) => task.projectId === project.id && task.status !== "done").length} 个待办</span><strong>{project.progress}%</strong></div><div className="progress-track"><span style={{ width: project.progress + "%" }} /></div><time>{formatRelative(project.updatedAt)}</time></button>)}</section>{selected ? <ProjectDetail project={selected} tasks={tasks} notes={notes} onUpdate={onUpdate} onArchive={onArchive} onMoveSpace={onMoveSpace} onDelete={onDelete} /> : <EmptyState size="placeholder" className="project-detail-placeholder"><div className="placeholder-glyph">◆</div><h3>选择一个项目</h3><p>查看项目进度、关联任务和最近笔记。</p></EmptyState>}</div></div>;
}

function ProjectDetail({ project, tasks, notes, onUpdate, onArchive, onMoveSpace, onDelete }: { project: Project; tasks: Task[]; notes: Note[]; onUpdate: (project: Project) => void; onArchive: (project: Project) => void; onMoveSpace: (project: Project, space: ContentSpace) => void | Promise<unknown>; onDelete: (project: Project) => Promise<void> }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState(project.status);
  const [progress, setProgress] = useState(project.progress);
  useEffect(() => { setName(project.name); setDescription(project.description); setStatus(project.status); setProgress(project.progress); }, [project.id, project.name, project.description, project.status, project.progress]);
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const projectNotes = notes.filter((note) => note.projectId === project.id);
  const save = () => onUpdate({ ...project, name: name.trim() || project.name, description, status, progress });
  return <aside className="project-detail"><div className="detail-heading"><div><span className={"project-status-dot " + status} /> <span>{projectStatusLabel[status]}</span></div><div className="editor-actions"><SpaceMoveButton space={project.space} onMove={(nextSpace) => onMoveSpace({ ...project, name: name.trim() || project.name, description, status, progress }, nextSpace)} /><Button size="small" variant="subtle" onClick={() => onArchive(project)}>归档</Button><Button size="small" variant="danger" onClick={() => void onDelete(project)}>删除</Button><Button variant="primary" className="compact" onClick={save}>保存</Button></div></div><label className="detail-label">项目名称<TextField value={name} onChange={(event) => setName(event.target.value)} /></label><div className="detail-progress"><div><span>项目进度</span><strong>{progress}%</strong></div><div className="progress-track large"><span style={{ width: progress + "%" }} /></div></div><label className="detail-label">描述<TextArea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></label><div className="form-grid detail-fields"><label>状态<SelectField value={status} onChange={(event) => setStatus(event.target.value as Project["status"])}><option value="planning">规划中</option><option value="active">进行中</option><option value="paused">已暂停</option><option value="completed">已完成</option><option value="archived">已归档</option></SelectField></label><label>进度<TextField type="number" min="0" max="100" value={progress} onChange={(event) => setProgress(Math.max(0, Math.min(100, Number(event.target.value))))} /></label></div><div className="detail-section"><div className="detail-section-heading"><strong>近期任务</strong><span>{projectTasks.length}</span></div>{projectTasks.slice(0, 4).map((task) => <div className="detail-task" key={task.id}><span className={"check-circle mini " + (task.status === "done" ? "checked" : "")}>{task.status === "done" ? "✓" : ""}</span><span>{task.title}</span></div>)}{projectTasks.length === 0 ? <p className="muted">还没有关联任务</p> : null}</div><div className="detail-section"><div className="detail-section-heading"><strong>项目笔记</strong><span>{projectNotes.length}</span></div>{projectNotes.slice(0, 3).map((note) => <div className="detail-note" key={note.id}><span className="note-symbol">▤</span><span>{note.title}</span></div>)}{projectNotes.length === 0 ? <p className="muted">还没有关联笔记</p> : null}</div></aside>;
}
