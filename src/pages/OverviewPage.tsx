import type { Checklist, InboxItem, Note, PageId, Project, ScheduleEvent, Space, Task } from "../types";
import { formatRelative, todayKey } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { CheckIcon } from "../components/CheckIcon";
import type { CreateKind } from "../components/Modal";

interface OverviewPageProps {
  space: Space;
  notes: Note[];
  tasks: Task[];
  projects: Project[];
  inbox: InboxItem[];
  events: ScheduleEvent[];
  checklists: Checklist[];
  onCreate: (kind: CreateKind) => void;
  onNavigate: (page: PageId) => void;
  onToggleTask: (task: Task) => void;
}

export function OverviewPage({ space, notes, tasks, projects, inbox, events, checklists, onCreate, onNavigate, onToggleTask }: OverviewPageProps) {
  const activeTasks = tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const todayTasks = activeTasks.filter((task) => task.dueDate === todayKey());
  const activeProjects = projects.filter((project) => project.status === "active" || project.status === "planning").slice(0, 3);
  const recentNotes = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const todayEvents = events.filter((event) => event.date === todayKey()).sort((a, b) => (a.startTime ?? "00:00").localeCompare(b.startTime ?? "00:00"));
  const activeChecklist = checklists.find((checklist) => checklist.items.some((item) => !item.completed));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const spaceLabel = space === "all" ? "今天，把重要的事往前推进一点。" : `${space === "personal" ? "个人" : "工作"}空间，今天也安排得井井有条。`;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="我的工作台" title={greeting} description={spaceLabel} action={<button type="button" className="button primary" onClick={() => onCreate("inbox")}>＋ 快速记录</button>} />

      <section className="welcome-strip">
        <div>
          <span className="welcome-kicker">LOCAL FIRST · {new Date().toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" })}</span>
          <h2>让信息围绕你正在做的事组织起来。</h2>
          <p>先记录，再整理。所有内容都保存在本地，断网也能继续工作。</p>
        </div>
        <div className="welcome-orbit" aria-hidden="true"><span /><span /><span /></div>
      </section>

      <div className="overview-grid">
        <section className="dashboard-card today-card">
          <div className="card-heading"><div><span className="card-kicker">今天</span><h3>{todayTasks.length ? `${todayTasks.length} 件待处理` : "今天暂时清爽"}</h3></div><button type="button" className="text-button" onClick={() => onNavigate("today")}>查看全部 →</button></div>
          <div className="task-preview-list">
            {todayTasks.length === 0 ? <EmptyCard icon="☀" text="没有安排在今天截止的任务" action="添加任务" onClick={() => onCreate("task")} /> : todayTasks.slice(0, 4).map((task) => <button type="button" className="task-preview" key={task.id} onClick={() => onToggleTask(task)}><span className={`check-circle ${task.status === "done" ? "checked" : ""}`}><CheckIcon /></span><span>{task.title}</span><em className={`priority-dot ${task.priority}`} /></button>)}
          </div>
        </section>

        <section className="dashboard-card inbox-card">
          <div className="card-heading"><div><span className="card-kicker">收件箱</span><h3>{inbox.length ? `${inbox.length} 条待整理` : "收件箱已清空"}</h3></div><button type="button" className="text-button" onClick={() => onNavigate("inbox")}>去整理 →</button></div>
          {inbox.length === 0 ? <EmptyCard icon="▣" text="把临时想法放在这里" action="快速记录" onClick={() => onCreate("inbox")} /> : <div className="inbox-summary">{inbox.slice(0, 3).map((item) => <div className="inbox-summary-item" key={item.id}><span className="mini-type">{item.kind === "task" ? "✓" : "·"}</span><span>{item.title}</span><time>{formatRelative(item.createdAt)}</time></div>)}</div>}
        </section>

        <section className="dashboard-card projects-card">
          <div className="card-heading"><div><span className="card-kicker">正在进行的项目</span><h3>{activeProjects.length ? `${activeProjects.length} 个项目` : "还没有项目"}</h3></div><button type="button" className="text-button" onClick={() => onNavigate("projects")}>查看项目 →</button></div>
          {activeProjects.length === 0 ? <EmptyCard icon="◆" text="为一组任务建立上下文" action="新建项目" onClick={() => onCreate("project")} /> : <div className="project-progress-list">{activeProjects.map((project) => <button type="button" className="project-progress" key={project.id} onClick={() => onNavigate("projects")}><div><span>{project.name}</span><strong>{project.progress}%</strong></div><div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div></button>)}</div>}
        </section>

        <section className="dashboard-card recent-card">
          <div className="card-heading"><div><span className="card-kicker">最近记录</span><h3>你刚刚留下的内容</h3></div><button type="button" className="text-button" onClick={() => onNavigate("notes")}>查看笔记 →</button></div>
          {recentNotes.length === 0 ? <EmptyCard icon="▤" text="记录你的第一个想法" action="新建笔记" onClick={() => onCreate("note")} /> : <div className="recent-list">{recentNotes.map((note) => <button type="button" className="recent-item" key={note.id} onClick={() => onNavigate("notes")}><span className="note-symbol">▤</span><span><strong>{note.title}</strong><small>{note.content.replace(/[#>*`\n]/g, " ").slice(0, 72) || "暂无正文"}</small></span><time>{formatRelative(note.updatedAt)}</time></button>)}</div>}
        </section>

        <section className="dashboard-card schedule-card">
          <div className="card-heading"><div><span className="card-kicker">今日安排</span><h3>{todayEvents.length ? `${todayEvents.length} 个日程` : "今天还没有日程"}</h3></div><button type="button" className="text-button" onClick={() => onNavigate("schedule")}>打开日程 →</button></div>
          {todayEvents.length === 0 ? <EmptyCard icon="◷" text="把任务放进时间里" action="创建日程" onClick={() => onNavigate("schedule")} /> : <div className="schedule-summary-list">{todayEvents.slice(0, 3).map((event) => <button type="button" className="schedule-summary-item" key={event.id} onClick={() => onNavigate("schedule")}><span>{event.allDay ? "全天" : event.startTime}</span><strong>{event.title}</strong></button>)}</div>}
        </section>

        <section className="dashboard-card checklist-card">
          <div className="card-heading"><div><span className="card-kicker">Checklist</span><h3>{activeChecklist ? activeChecklist.title : "准备一份清单"}</h3></div><button type="button" className="text-button" onClick={() => onNavigate("checklists")}>查看清单 →</button></div>
          {activeChecklist ? <div className="checklist-summary"><div className="progress-track"><span style={{ width: `${activeChecklist.items.length ? (activeChecklist.items.filter((item) => item.completed).length / activeChecklist.items.length) * 100 : 0}%` }} /></div><p>{activeChecklist.items.filter((item) => item.completed).length}/{activeChecklist.items.length} 项完成</p></div> : <EmptyCard icon="☑" text="把重复流程保存下来" action="新建清单" onClick={() => onCreate("checklist")} />}
        </section>
      </div>

      <section className="quick-start-row">
        <span>现在想做什么？</span>
        <button type="button" onClick={() => onCreate("task")}><span>✓</span> 新建任务</button>
        <button type="button" onClick={() => onCreate("note")}><span>▤</span> 写一篇笔记</button>
        <button type="button" onClick={() => onCreate("spark")}><span>✦</span> 记录灵光</button>
        <button type="button" onClick={() => onCreate("project")}><span>◆</span> 创建项目</button>
      </section>
    </div>
  );
}

function EmptyCard({ icon, text, action, onClick }: { icon: string; text: string; action: string; onClick: () => void }) {
  return <div className="empty-card"><span className="empty-card-icon">{icon}</span><p>{text}</p><button type="button" className="text-button" onClick={onClick}>{action} →</button></div>;
}
