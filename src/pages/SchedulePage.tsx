import { useEffect, useMemo, useState } from "react";
import type { ScheduleEvent, Space, Task, Project } from "../types";
import type { ScheduleEventInput } from "../lib/api";
import { parseTags } from "../lib/format";
import { PageHeader } from "../components/PageHeader";

type CalendarView = "day" | "week" | "month" | "list";

interface SchedulePageProps {
  space: Space;
  createSpace: "personal" | "work";
  events: ScheduleEvent[];
  tasks: Task[];
  projects: Project[];
  createRequest: number;
  selectedId: string | null;
  onSelectionHandled: () => void;
  onSave: (draft: ScheduleEventInput, existing?: ScheduleEvent) => Promise<void>;
  onArchive: (event: ScheduleEvent) => void;
  onDelete: (event: ScheduleEvent) => Promise<void>;
}

export function SchedulePage({ space, createSpace, events, tasks, projects, createRequest, selectedId, onSelectionHandled, onSave, onArchive, onDelete }: SchedulePageProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(todayKey());
  const [editor, setEditor] = useState<{ event?: ScheduleEvent; date: string } | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    const event = events.find((item) => item.id === selectedId);
    if (!event) return;
    setEditor({ event, date: event.date });
    onSelectionHandled();
  }, [events, onSelectionHandled, selectedId]);
  useEffect(() => {
    if (createRequest > 0) setEditor({ date: todayKey() });
  }, [createRequest]);
  const week = weekDays(anchor);
  const visibleEvents = useMemo(() => {
    if (view === "day") return events.filter((event) => event.date === anchor);
    if (view === "week") {
      const dates = new Set(week.map(dateKey));
      return events.filter((event) => dates.has(event.date));
    }
    if (view === "month") {
      const date = parseDate(anchor);
      const monthStart = dateKey(new Date(date.getFullYear(), date.getMonth(), 1));
      const monthEnd = dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
      return events.filter((event) => event.date >= monthStart && event.date <= monthEnd).sort(eventSort);
    }
    return [...events].sort(eventSort);
  }, [anchor, events, view, week]);

  const shift = (amount: number) => {
    if (view === "month") {
      const date = parseDate(anchor);
      setAnchor(dateKey(new Date(date.getFullYear(), date.getMonth() + amount, 1)));
      return;
    }
    setAnchor(dateKey(addDays(parseDate(anchor), view === "week" ? amount * 7 : amount)));
  };
  const anchorDate = parseDate(anchor);
  const heading = view === "week" ? `${shortDate(week[0])} — ${shortDate(week[6])}` : view === "month" ? `${anchorDate.getFullYear()}年${anchorDate.getMonth() + 1}月` : shortDate(anchorDate);

  return (
    <div className="page-stack schedule-page">
      <PageHeader eyebrow="时间组织" title="日程" description={`${space === "all" ? "全部空间" : space === "personal" ? "个人空间" : "工作空间"} · 把任务放进可以执行的时间里`} action={<button className="button primary" onClick={() => setEditor({ date: anchor })}>＋ 新建日程</button>} />
      <section className="calendar-toolbar">
        <div className="calendar-heading"><button className="icon-button" onClick={() => shift(-1)} aria-label="上一个时间段">‹</button><strong>{heading}</strong><button className="icon-button" onClick={() => shift(1)} aria-label="下一个时间段">›</button><button className="small-button" onClick={() => setAnchor(todayKey())}>今天</button></div>
        <div className="calendar-view-tabs">{([ ["day", "日"], ["week", "周"], ["month", "月"], ["list", "列表"] ] as const).map(([value, label]) => <button className={view === value ? "is-active" : ""} key={value} onClick={() => setView(value)}>{label}</button>)}</div>
      </section>
      {view === "day" ? <DayView date={anchor} events={visibleEvents} onSelect={(event) => setEditor({ event, date: event.date })} onCreate={() => setEditor({ date: anchor })} /> : null}
      {view === "week" ? <WeekView days={week} events={visibleEvents} onSelect={(event) => setEditor({ event, date: event.date })} onCreate={(date) => setEditor({ date })} /> : null}
      {view === "month" ? <MonthView days={monthDays(anchor)} events={visibleEvents} onSelect={(event) => setEditor({ event, date: event.date })} onCreate={(date) => setEditor({ date })} anchor={anchor} /> : null}
      {view === "list" ? <ListView events={visibleEvents} onSelect={(event) => setEditor({ event, date: event.date })} onCreate={() => setEditor({ date: anchor })} /> : null}
      {editor ? <ScheduleEventEditor event={editor.event} date={editor.date} space={editor.event?.space ?? createSpace} tasks={tasks} projects={projects} onClose={() => setEditor(null)} onSave={async (draft) => { await onSave(draft, editor.event); setEditor(null); }} onArchive={editor.event ? () => { onArchive(editor.event!); setEditor(null); } : undefined} onDelete={editor.event ? async () => { await onDelete(editor.event!); setEditor(null); } : undefined} /> : null}
    </div>
  );
}

function DayView({ date, events, onSelect, onCreate }: { date: string; events: ScheduleEvent[]; onSelect: (event: ScheduleEvent) => void; onCreate: () => void }) {
  return <section className="calendar-panel"><div className="calendar-panel-heading"><div><span className="card-kicker">{formatWeekday(date)}</span><h2>{shortDate(parseDate(date))}</h2></div><span className="muted">{events.length} 个事件</span></div>{events.length === 0 ? <CalendarEmpty onCreate={onCreate} /> : <div className="event-list">{events.map((event) => <EventCard key={event.id} event={event} onClick={() => onSelect(event)} />)}</div>}</section>;
}

function WeekView({ days, events, onSelect, onCreate }: { days: Date[]; events: ScheduleEvent[]; onSelect: (event: ScheduleEvent) => void; onCreate: (date: string) => void }) {
  return <section className="calendar-panel week-calendar"><div className="week-grid">{days.map((day) => { const key = dateKey(day); const dayEvents = events.filter((event) => event.date === key); return <div className={`week-column ${key === todayKey() ? "is-today" : ""}`} key={key}><button className="week-day-heading" onClick={() => onCreate(key)}><span>{formatWeekday(key)}</span><strong>{day.getDate()}</strong></button><div className="week-events">{dayEvents.map((event) => <EventCard key={event.id} event={event} compact onClick={() => onSelect(event)} />)}{dayEvents.length === 0 ? <button className="week-add" onClick={() => onCreate(key)}>＋ 添加</button> : null}</div></div>; })}</div></section>;
}

function MonthView({ days, events, onSelect, onCreate, anchor }: { days: Date[]; events: ScheduleEvent[]; onSelect: (event: ScheduleEvent) => void; onCreate: (date: string) => void; anchor: string }) {
  const currentMonth = anchor.slice(0, 7);
  return <section className="calendar-panel month-calendar"><div className="month-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((weekday) => <span key={weekday}>周{weekday}</span>)}</div><div className="month-grid">{days.map((day) => { const key = dateKey(day); const dayEvents = events.filter((event) => event.date === key); const isCurrentMonth = key.startsWith(currentMonth); return <div className={`month-cell ${isCurrentMonth ? "" : "is-outside"} ${key === todayKey() ? "is-today" : ""}`} key={key}><button className="month-day-heading" onClick={() => onCreate(key)} aria-label={`在 ${key} 新建日程`}><span>{day.getDate()}</span></button><div className="month-events">{dayEvents.slice(0, 4).map((event) => <button className="month-event" key={event.id} onClick={() => onSelect(event)}><span>{event.allDay ? "全天" : event.startTime ?? ""}</span><strong>{event.title}</strong></button>)}{dayEvents.length > 4 ? <small className="month-more">+{dayEvents.length - 4} 个事件</small> : null}</div></div>; })}</div></section>;
}

function ListView({ events, onSelect, onCreate }: { events: ScheduleEvent[]; onSelect: (event: ScheduleEvent) => void; onCreate: () => void }) {
  const grouped = events.reduce<Record<string, ScheduleEvent[]>>((result, event) => { (result[event.date] ??= []).push(event); return result; }, {});
  return <section className="calendar-panel"><div className="calendar-panel-heading"><div><span className="card-kicker">全部日程</span><h2>{events.length} 个事件</h2></div><button className="small-button" onClick={onCreate}>＋ 新建</button></div>{events.length === 0 ? <CalendarEmpty onCreate={onCreate} /> : <div className="event-groups">{Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateEvents]) => <div className="event-group" key={date}><div className="event-group-date"><strong>{shortDate(parseDate(date))}</strong><span>{formatWeekday(date)}</span></div><div className="event-list">{dateEvents.map((event) => <EventCard key={event.id} event={event} onClick={() => onSelect(event)} />)}</div></div>)}</div>}</section>;
}

function EventCard({ event, compact = false, onClick }: { event: ScheduleEvent; compact?: boolean; onClick: () => void }) {
  return <button className={`event-card ${compact ? "is-compact" : ""}`} onClick={onClick}><span className="event-time">{event.allDay ? "全天" : `${event.startTime} — ${event.endTime}`}</span><span className="event-card-copy"><strong>{event.title}</strong>{!compact && event.notes ? <small>{event.notes}</small> : null}{event.taskId ? <small className="event-link">✓ 已关联任务</small> : null}</span></button>;
}

function CalendarEmpty({ onCreate }: { onCreate: () => void }) {
  return <div className="calendar-empty"><span>◷</span><h3>这段时间还没有日程</h3><p>把一个任务放进时间里，给今天一个清晰的下一步。</p><button className="button secondary" onClick={onCreate}>创建日程</button></div>;
}

function ScheduleEventEditor({ event, date, space, tasks, projects, onClose, onSave, onArchive, onDelete }: { event?: ScheduleEvent; date: string; space: "personal" | "work"; tasks: Task[]; projects: Project[]; onClose: () => void; onSave: (draft: ScheduleEventInput) => Promise<void>; onArchive?: () => void; onDelete?: () => Promise<void> }) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [eventDate, setEventDate] = useState(event?.date ?? date);
  const [startTime, setStartTime] = useState(event?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(event?.endTime ?? "10:00");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [taskId, setTaskId] = useState(event?.taskId ?? "");
  const [projectId, setProjectId] = useState(event?.projectId ?? "");
  const [tags, setTags] = useState(event?.tags.join(" ") ?? "");
  const [error, setError] = useState("");
  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    if (!title.trim()) { setError("日程标题不能为空"); return; }
    setError("");
    try {
      await onSave({ title: title.trim(), date: eventDate, startTime: allDay ? null : startTime, endTime: allDay ? null : endTime, allDay, notes, taskId: taskId || null, projectId: projectId || null, space, tags: parseTags(tags) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal-card schedule-editor" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">{event ? "编辑日程" : "新建日程"}</span><h2>{event ? event.title : "安排一个时间"}</h2></div><button type="button" className="close-button" onClick={onClose} aria-label="关闭">×</button></div><label>标题<input autoFocus value={title} onChange={(inputEvent) => setTitle(inputEvent.target.value)} placeholder="例如：产品评审" /></label><div className="form-grid"><label>日期<input type="date" value={eventDate} onChange={(inputEvent) => setEventDate(inputEvent.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={allDay} onChange={(inputEvent) => setAllDay(inputEvent.target.checked)} />全天事件</label></div>{!allDay ? <div className="form-grid"><label>开始时间<input type="time" value={startTime} onChange={(inputEvent) => setStartTime(inputEvent.target.value)} /></label><label>结束时间<input type="time" value={endTime} onChange={(inputEvent) => setEndTime(inputEvent.target.value)} /></label></div> : null}<label>备注<textarea value={notes} onChange={(inputEvent) => setNotes(inputEvent.target.value)} placeholder="这次日程要完成什么？" rows={4} /></label><div className="form-grid"><label>关联任务<select value={taskId} onChange={(inputEvent) => setTaskId(inputEvent.target.value)}><option value="">不关联任务</option>{tasks.filter((task) => task.space === space && task.status !== "cancelled").map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label>关联项目<select value={projectId} onChange={(inputEvent) => setProjectId(inputEvent.target.value)}><option value="">不关联项目</option>{projects.filter((project) => project.space === space).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div><label>标签<input value={tags} onChange={(inputEvent) => setTags(inputEvent.target.value)} placeholder="#评审  #本周" /></label>{error ? <div className="form-error">{error}</div> : null}<div className="modal-actions">{onArchive ? <button type="button" className="small-button subtle" onClick={onArchive}>归档</button> : null}{onDelete ? <button type="button" className="small-button subtle danger" onClick={() => void onDelete()}>删除</button> : null}<span /><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary">保存</button></div></form></div>;
}

function eventSort(a: ScheduleEvent, b: ScheduleEvent) { return `${a.date}-${a.startTime ?? "00:00"}`.localeCompare(`${b.date}-${b.startTime ?? "00:00"}`); }
function todayKey() { return dateKey(new Date()); }
function parseDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function addDays(value: Date, amount: number) { const next = new Date(value); next.setDate(next.getDate() + amount); return next; }
function weekDays(value: string) { const date = parseDate(value); const mondayOffset = (date.getDay() + 6) % 7; const monday = addDays(date, -mondayOffset); return Array.from({ length: 7 }, (_, index) => addDays(monday, index)); }
function monthDays(value: string) { const date = parseDate(value); const first = new Date(date.getFullYear(), date.getMonth(), 1); const mondayOffset = (first.getDay() + 6) % 7; const start = addDays(first, -mondayOffset); return Array.from({ length: 42 }, (_, index) => addDays(start, index)); }
function shortDate(value: Date) { return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(value); }
function formatWeekday(value: string) { return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(parseDate(value)); }
