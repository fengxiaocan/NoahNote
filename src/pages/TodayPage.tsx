import { Button, EmptyState } from "../components/ui";
import type { Bug, InboxItem, Note, PageId, ScheduleEvent, Space, Task } from "../types";
import { formatDate, formatRelative, statusLabel, todayKey } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { CheckIcon } from "../components/CheckIcon";
import type { CreateKind } from "../components/Modal";
import { bugStatusLabels, isBugDueToday, isBugOverdue } from "../lib/bugs";

interface TodayPageProps {
  space: Space;
  tasks: Task[];
  notes: Note[];
  events: ScheduleEvent[];
  inbox: InboxItem[];
  bugs: Bug[];
  onCreate: (kind: CreateKind) => void;
  onNavigate?: (page: PageId) => void;
  onToggleTask: (task: Task) => void;
  onOpenBug: (id: string) => void;
}

export function TodayPage({ space, tasks, notes, events, inbox, bugs, onCreate, onNavigate, onToggleTask, onOpenBug }: TodayPageProps) {
  const today = todayKey();
  const dueToday = tasks.filter((task) => task.dueDate === today && task.status !== "cancelled");
  const overdue = tasks.filter((task) => task.dueDate && task.dueDate < today && !["done", "cancelled"].includes(task.status));
  const recentNotes = notes.filter((note) => note.createdAt.slice(0, 10) === today).slice(0, 5);
  const todayEvents = events.filter((event) => event.date === today).sort((left, right) => `${left.startTime ?? "00:00"}-${left.title}`.localeCompare(`${right.startTime ?? "00:00"}-${right.title}`));
  const todayInbox = inbox.filter((item) => item.createdAt.slice(0, 10) === today).slice(0, 5);
  const currentBugs = bugs.filter((bug) => !bug.archived && (space === "all" || bug.space === space));
  const bugsDueToday = currentBugs.filter((bug) => isBugDueToday(bug, today));
  const overdueBugs = currentBugs.filter((bug) => isBugOverdue(bug, today));
  return (
    <div className="page-stack narrow-page">
      <PageHeader eyebrow={formatDate(new Date().toISOString())} title="今天" description={space === "all" ? "全部空间的今日焦点" : `${space === "personal" ? "个人" : "工作"}空间的今日焦点`} action={<Button variant="primary" onClick={() => onCreate("task")}>＋ 新建任务</Button>} />
      <div className="today-summary"><div><span>今日任务</span><strong>{dueToday.filter((task) => task.status !== "done").length}</strong></div><div><span>已完成</span><strong className="green">{dueToday.filter((task) => task.status === "done").length}</strong></div><div><span>逾期</span><strong className={overdue.length ? "orange" : ""}>{overdue.length}</strong></div><div><span>今日记录</span><strong>{recentNotes.length + todayInbox.length}</strong></div></div>
      <div className="today-columns">
        <section className="list-panel"><div className="list-panel-heading"><span>今日任务</span><span className="muted">{today}</span></div>{dueToday.length === 0 ? <EmptyState size="compact"><span>☀</span><p>今天还没有任务安排</p><Button variant="subtle" onClick={() => onCreate("task")}>添加一个 →</Button></EmptyState> : <div className="today-task-list">{dueToday.map((task) => <button type="button" className="today-task" key={task.id} onClick={() => onToggleTask(task)}><span className={`check-circle ${task.status === "done" ? "checked" : ""}`}><CheckIcon /></span><span className={task.status === "done" ? "completed-text" : ""}><strong>{task.title}</strong><small>{statusLabel[task.status]} · {task.priority === "normal" ? "普通优先级" : task.priority === "urgent" ? "紧急" : task.priority === "high" ? "高优先级" : "低优先级"}</small></span><em className={`priority-dot ${task.priority}`} /></button>)}</div>}</section>
        <section className="list-panel"><div className="list-panel-heading"><span>今日记录</span><span className="muted">最近更新</span></div>{recentNotes.length === 0 ? <EmptyState size="compact"><span>▤</span><p>今天还没有新的笔记</p><Button variant="subtle" onClick={() => onCreate("note")}>写下第一篇 →</Button></EmptyState> : <div className="today-note-list">{recentNotes.map((note) => <div className="today-note" key={note.id}><span className="note-symbol">▤</span><div><strong>{note.title}</strong><p>{note.content.replace(/[#>*`\n]/g, " ").slice(0, 96) || "暂无正文"}</p><time>{formatRelative(note.updatedAt)}</time></div></div>)}</div>}</section>
      </div>
      <div className="today-columns">
        <section className="list-panel"><div className="list-panel-heading"><span>今日会议与日程</span><span className="muted">{todayEvents.length} 个安排</span></div>{todayEvents.length === 0 ? <EmptyState size="compact"><span>◷</span><p>今天还没有日程</p>{onNavigate ? <Button variant="subtle" onClick={() => onNavigate("schedule")}>打开日程 →</Button> : null}</EmptyState> : <div className="today-note-list">{todayEvents.map((event) => <div className="today-note" key={event.id}><span className="note-symbol">◷</span><div><strong>{event.title}</strong><p>{event.allDay ? "全天" : `${event.startTime ?? ""} — ${event.endTime ?? ""}`}{event.notes ? ` · ${event.notes}` : ""}</p><time>{event.space === "personal" ? "个人" : "工作"}</time></div></div>)}</div>}</section>
        <section className="list-panel"><div className="list-panel-heading"><span>今日收件箱</span><span className="muted">{todayInbox.length} 条新记录</span></div>{todayInbox.length === 0 ? <EmptyState size="compact"><span>▣</span><p>今天还没有收件箱记录</p><Button variant="subtle" onClick={() => onCreate("inbox")}>快速记录 →</Button></EmptyState> : <div className="today-note-list">{todayInbox.map((item) => <div className="today-note" key={item.id}><span className="note-symbol">▣</span><div><strong>{item.title}</strong><p>{item.body || "暂无补充内容"}</p><time>{item.space === "personal" ? "个人" : "工作"} · {formatRelative(item.createdAt)}</time></div></div>)}</div>}</section>
      </div>
      {overdue.length > 0 ? <section className="list-panel overdue-panel"><div className="list-panel-heading"><span className="orange-text">需要留意的逾期任务</span><span className="muted">{overdue.length} 件</span></div><div className="today-task-list">{overdue.map((task) => <button type="button" className="today-task" key={task.id} onClick={() => onToggleTask(task)}><span className="check-circle"><CheckIcon /></span><span><strong>{task.title}</strong><small className="orange-text">截止于 {formatDate(task.dueDate)}</small></span></button>)}</div></section> : null}
      {bugsDueToday.length || overdueBugs.length ? <section className="list-panel overdue-panel"><div className="list-panel-heading"><span className="orange-text">BUG 跟进</span><span className="muted">{bugsDueToday.length} 条今日到期 · {overdueBugs.length} 条逾期</span></div><div className="today-note-list">{[...overdueBugs, ...bugsDueToday.filter((bug) => !overdueBugs.includes(bug))].map((bug) => <button type="button" className="today-note bug-today-row" key={bug.id} onClick={() => onOpenBug(bug.id)}><span className="note-symbol">⌁</span><span><strong>{bug.code} · {bug.title}</strong><p>{bugStatusLabels[bug.status]} · {bug.dueDate ? `截止 ${formatDate(bug.dueDate)}` : ""}</p></span><time className={isBugOverdue(bug, today) ? "orange-text" : ""}>{isBugOverdue(bug, today) ? "已逾期" : "今天"}</time></button>)}</div></section> : null}
    </div>
  );
}
