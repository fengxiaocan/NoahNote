import { Button, DialogLayer, EmptyState, IconButton, SelectField, TextArea, TextField } from "../components/ui";
import { useEffect, useMemo, useState } from "react";
import type { ContentSpace, Project, Space, Task, TaskPriority, TaskStatus } from "../types";
import { formatDate, parseTags, priorityLabel, statusLabel, todayKey } from "../lib/format";
import {
  calculateTaskStats,
  filterAndSortTasks,
  isTaskDueToday,
  isTaskOverdue,
  type TaskFilterStatus,
  type TaskSort,
  buildTaskHierarchy,
} from "../lib/tasks";
import { PageHeader } from "../components/PageHeader";
import { SpaceMoveButton } from "../components/SpaceMoveButton";
import { CheckIcon } from "../components/CheckIcon";
import type { CreateKind } from "../components/Modal";
import { api } from "../lib/api";

interface TasksPageProps {
  space: Space;
  tasks: Task[];
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (kind: CreateKind) => void;
  onUpdate: (task: Task) => void | Promise<unknown>;
  onArchive: (task: Task) => void | Promise<unknown>;
  onMoveSpace: (task: Task, space: ContentSpace) => void | Promise<unknown>;
  onDelete: (task: Task) => Promise<void>;
  onImport: () => void | Promise<void>;
  onQuickCreate?: (draft: {
    title: string;
    priority?: TaskPriority;
    dueDate?: string | null;
    projectId?: string | null;
    status?: TaskStatus;
    parentId?: string | null;
  }) => Promise<void>;
}

type ViewMode = "list" | "kanban";

export function TasksPage({
  space,
  tasks,
  projects,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onArchive,
  onMoveSpace,
  onDelete,
  onImport,
  onQuickCreate,
}: TasksPageProps) {
  const [filter, setFilter] = useState<TaskFilterStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<TaskSort>("due_date");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedSubtaskMap, setExpandedSubtaskMap] = useState<Record<string, boolean>>({});

  // Quick Add state
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<TaskPriority>("normal");
  const [quickDueDate, setQuickDueDate] = useState("");
  const [quickProjectId, setQuickProjectId] = useState("");
  const [isQuickAdding, setIsQuickAdding] = useState(false);

  const today = todayKey();
  const stats = useMemo(() => calculateTaskStats(tasks, today), [tasks, today]);

  // Filter and sort tasks
  const visibleTasks = useMemo(() => {
    return filterAndSortTasks(
      tasks,
      {
        status: filter,
        priority: priorityFilter,
        projectId: projectFilter,
        search: searchQuery,
        sortBy: sort,
      },
      today
    );
  }, [tasks, filter, priorityFilter, projectFilter, searchQuery, sort, today]);

  // Project map for quick lookup
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  // Hierarchy for subtasks
  const { subtaskMap } = useMemo(() => buildTaskHierarchy(tasks), [tasks]);

  const toggleStatus = (task: Task) => {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    void onUpdate({ ...task, status: nextStatus });
  };

  const setTaskStatus = (task: Task, status: TaskStatus) => {
    void onUpdate({ ...task, status });
  };

  const toggleFavorite = (task: Task) => {
    void onUpdate({ ...task, favorite: !task.favorite });
  };

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

  const toggleSubtasksExpand = (taskId: string) => {
    setExpandedSubtaskMap((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // Handle Quick Add Submit
  const handleQuickAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;

    setIsQuickAdding(true);
    try {
      if (onQuickCreate) {
        await onQuickCreate({
          title,
          priority: quickPriority,
          dueDate: quickDueDate || null,
          projectId: quickProjectId || (projectFilter !== "all" && projectFilter !== "none" ? projectFilter : null),
          status: "todo",
        });
      } else {
        const targetSpace: ContentSpace = space === "all" ? "personal" : space;
        await api.createTask({
          title,
          space: targetSpace,
          priority: quickPriority,
          dueDate: quickDueDate || null,
          projectId: quickProjectId || (projectFilter !== "all" && projectFilter !== "none" ? projectFilter : null),
          status: "todo",
        });
      }
      setQuickTitle("");
      setQuickDueDate("");
    } catch (err) {
      console.error("Failed to quick create task:", err);
    } finally {
      setIsQuickAdding(false);
    }
  };

  return (
    <div className="page-stack tasks-page">
      <PageHeader
        eyebrow="清晰的下一步"
        title="任务"
        description={`${stats.todo + stats.inProgress} 件进行中 · ${stats.completed} 件已完成 · ${stats.overdue > 0 ? `${stats.overdue} 件已逾期 · ` : ""}完成度 ${stats.completionRate}%`}
        action={
          <>
            <Button variant="secondary"
             
              onClick={() => void onImport()}
            >
              📥 导入任务
            </Button>
            <Button variant="primary"
             
              onClick={() => onCreate("task")}
            >
              ＋ 新建任务
            </Button>
          </>
        }
      />

      {/* Task Statistics Dashboard Cards */}
      <div className="task-stats-bar">
        <div
          className={`task-stat-card ${filter === "all" ? "is-active" : ""}`}
          onClick={() => setFilter("all")}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">📋 全部任务</span>
          <strong className="stat-number">{stats.total}</strong>
        </div>
        <div
          className={`task-stat-card ${filter === "in_progress" || filter === "todo" ? "is-active" : ""}`}
          onClick={() => setFilter(filter === "in_progress" ? "todo" : "in_progress")}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">⏳ 进行与待办</span>
          <strong className="stat-number info-text">{stats.todo + stats.inProgress}</strong>
          <small className="stat-sub">{stats.inProgress} 进行中 / {stats.todo} 待办</small>
        </div>
        <div
          className={`task-stat-card ${filter === "today" ? "is-active" : ""}`}
          onClick={() => setFilter("today")}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">📅 今日待办</span>
          <strong className="stat-number amber-text">{stats.dueToday}</strong>
        </div>
        <div
          className={`task-stat-card ${filter === "overdue" ? "is-active" : ""} ${stats.overdue > 0 ? "warning-card" : ""}`}
          onClick={() => setFilter("overdue")}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">⚠️ 已逾期</span>
          <strong className={`stat-number ${stats.overdue > 0 ? "orange" : ""}`}>{stats.overdue}</strong>
        </div>
        <div
          className={`task-stat-card ${filter === "done" ? "is-active" : ""}`}
          onClick={() => setFilter("done")}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">🎯 完成率</span>
          <strong className="stat-number green">{stats.completionRate}%</strong>
          <div className="mini-progress-track">
            <div className="mini-progress-fill" style={{ width: `${stats.completionRate}%` }} />
          </div>
        </div>
      </div>

      {/* Task Toolbar: Search, Filters, Sorters, View Switcher */}
      <div className="task-toolbar-container">
        <div className="task-toolbar-top">
          <div className="task-search-bar">
            <span className="search-icon">🔍</span>
            <TextField
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索任务标题、描述或标签..."
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery("")}
                title="清空搜索"
              >
                ×
              </button>
            )}
          </div>

          <div className="task-toolbar-actions">
            <label className="task-control-label">
              <span>项目</span>
              <SelectField
                aria-label="项目筛选"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
              >
                <option value="all">全部项目</option>
                <option value="none">未关联项目</option>
                {projects
                  .filter((p) => !p.archived && (space === "all" || p.space === space))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </SelectField>
            </label>

            <label className="task-control-label">
              <span>优先级</span>
              <SelectField
                aria-label="优先级筛选"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="all">全部优先级</option>
                <option value="urgent">紧急</option>
                <option value="high">高</option>
                <option value="normal">普通</option>
                <option value="low">低</option>
              </SelectField>
            </label>

            <label className="task-control-label">
              <span>排序</span>
              <SelectField
                aria-label="任务排序"
                value={sort}
                onChange={(e) => setSort(e.target.value as TaskSort)}
              >
                <option value="due_date">截止日期 (近到远)</option>
                <option value="due_date_desc">截止日期 (远到近)</option>
                <option value="priority">优先级 (高到低)</option>
                <option value="priority_desc">优先级 (低到高)</option>
                <option value="updated_at">最近更新</option>
                <option value="created_at">创建时间</option>
                <option value="title">任务标题</option>
              </SelectField>
            </label>

            <div className="view-mode-toggle">
              <button
                type="button"
                className={`toggle-btn ${viewMode === "list" ? "is-active" : ""}`}
                onClick={() => setViewMode("list")}
                title="列表视图"
              >
                ☰ 列表
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewMode === "kanban" ? "is-active" : ""}`}
                onClick={() => setViewMode("kanban")}
                title="看板视图"
              >
                ☷ 看板
              </button>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="task-status-tabs">
          {(
            [
              ["all", "全部", stats.total],
              ["todo", "待处理", stats.todo],
              ["in_progress", "进行中", stats.inProgress],
              ["waiting", "等待中", stats.waiting],
              ["today", "今日截止", stats.dueToday],
              ["overdue", "已逾期", stats.overdue],
              ["favorite", "星标", stats.favorite],
              ["done", "已完成", stats.completed],
            ] as const
          ).map(([value, label, count]) => (
            <button
              type="button"
              className={`status-tab-btn ${filter === value ? "is-active" : ""} ${value === "overdue" && count > 0 ? "has-overdue" : ""}`}
              key={value}
              onClick={() => setFilter(value)}
            >
              {label}
              <span className="tab-count">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Task Creation Bar */}
      <form className="task-quick-add-bar" onSubmit={handleQuickAdd}>
        <div className="quick-add-main">
          <TextField
            className="quick-add-input"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="＋ 快速添加任务，输入标题后按 Enter 创建..."
            disabled={isQuickAdding}
          />
        </div>
        <div className="quick-add-options">
          <SelectField
            className="quick-add-select"
            value={quickPriority}
            onChange={(e) => setQuickPriority(e.target.value as TaskPriority)}
            aria-label="快速设置优先级"
          >
            <option value="normal">普通优先级</option>
            <option value="high">高优先级</option>
            <option value="urgent">紧急优先级</option>
            <option value="low">低优先级</option>
          </SelectField>

          <SelectField
            className="quick-add-select"
            value={quickProjectId}
            onChange={(e) => setQuickProjectId(e.target.value)}
            aria-label="快速分配项目"
          >
            <option value="">不关联项目</option>
            {projects
              .filter((p) => !p.archived && (space === "all" || p.space === space))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </SelectField>

          <TextField
            type="date"
            className="quick-add-date"
            value={quickDueDate}
            onChange={(e) => setQuickDueDate(e.target.value)}
            aria-label="截止日期"
          />

          <Button variant="primary" className="compact"
            type="submit"
           
            disabled={!quickTitle.trim() || isQuickAdding}
          >
            添加
          </Button>
        </div>
      </form>

      {/* Main View: List or Kanban */}
      {viewMode === "list" ? (
        <section className="list-panel task-list-panel">
          <div className="list-panel-heading">
            <div className="heading-left">
              <span>{visibleTasks.length} 件任务</span>
              {(filter !== "all" || priorityFilter !== "all" || projectFilter !== "all" || searchQuery) && (
                <Button variant="subtle" className="reset-filter-btn"
                 
                  onClick={() => {
                    setFilter("all");
                    setPriorityFilter("all");
                    setProjectFilter("all");
                    setSearchQuery("");
                  }}
                >
                  重置筛选
                </Button>
              )}
            </div>
            <span className="muted">点击任务编辑详细信息，点击圆圈快速完成</span>
          </div>

          {visibleTasks.length === 0 ? (
            <EmptyState size="large">
              <div className="large-empty-icon">{filter === "done" ? "✓" : "📋"}</div>
              <h3>{filter === "done" ? "还没有已完成的任务" : "这里还没有符合条件的任务"}</h3>
              <p>
                {searchQuery || filter !== "all" || priorityFilter !== "all"
                  ? "试试调整筛选条件或搜索关键字。"
                  : "把目标拆成一个个清晰的下一步。"}
              </p>
              <Button variant="primary"
               
                onClick={() => onCreate("task")}
              >
                ＋ 新建任务
              </Button>
            </EmptyState>
          ) : (
            <div className="task-list">
              {visibleTasks.map((task) => {
                const isOverdue = isTaskOverdue(task, today);
                const isDueToday = isTaskDueToday(task, today);
                const subtasks = subtaskMap.get(task.id) ?? [];
                const hasSubtasks = subtasks.length > 0;
                const completedSubtasks = subtasks.filter((st) => st.status === "done").length;
                const isExpanded = !!expandedSubtaskMap[task.id];
                const project = task.projectId ? projectMap.get(task.projectId) : null;

                return (
                  <div key={task.id} className="task-row-group">
                    <article
                      id={`task-${task.id}`}
                      className={`task-row ${task.status === "done" ? "is-done" : ""} ${task.id === selectedId ? "is-selected" : ""} ${isOverdue ? "is-overdue" : ""}`}
                      onClick={() => openEditor(task)}
                    >
                      <button
                        type="button"
                        className={`check-circle ${task.status === "done" ? "checked" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStatus(task);
                        }}
                        aria-label={task.status === "done" ? "标记为待办" : "标记为完成"}
                      >
                        <CheckIcon />
                      </button>

                      <button
                        type="button"
                        className={`star-button ${task.favorite ? "is-favorite" : ""}`}
                        aria-label={task.favorite ? "取消星标" : "标记星标"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(task);
                        }}
                        title={task.favorite ? "取消星标" : "标记星标"}
                      >
                        {task.favorite ? "★" : "☆"}
                      </button>

                      <div className="task-row-content">
                        <div className="task-title-row">
                          <strong className="task-title">{task.title}</strong>
                          {hasSubtasks && (
                            <button
                              type="button"
                              className="subtask-badge"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSubtasksExpand(task.id);
                              }}
                              title="展开/收起子任务"
                            >
                              <span className="subtask-arrow">{isExpanded ? "▼" : "▶"}</span>
                              <span>
                                {completedSubtasks}/{subtasks.length} 子任务
                              </span>
                            </button>
                          )}
                        </div>

                        {task.description && (
                          <p className="task-desc-snippet">{task.description}</p>
                        )}

                        <div className="item-meta">
                          {/* Project Badge */}
                          {project && (
                            <span
                              className="task-project-tag"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectFilter(project.id);
                              }}
                              title={`项目: ${project.name} (点击筛选)`}
                            >
                              📁 {project.name}
                            </span>
                          )}

                          {/* Status Pill */}
                          <span className={`status-pill ${task.status}`}>
                            {statusLabel[task.status] ?? task.status}
                          </span>

                          {/* Priority Pill */}
                          <span className={`priority-label ${task.priority}`}>
                            {priorityLabel[task.priority]}
                          </span>

                          {/* Due Date Indicator */}
                          {task.dueDate ? (
                            <span
                              className={`due-date-pill ${isOverdue ? "overdue" : isDueToday ? "today" : ""}`}
                            >
                              📅 {isOverdue ? `已逾期 (${formatDate(task.dueDate)})` : isDueToday ? "今天截止" : formatDate(task.dueDate)}
                            </span>
                          ) : (
                            <span className="due-date-none">无截止日期</span>
                          )}

                          {/* Tags */}
                          {task.tags.map((tag) => (
                            <span
                              className="tag"
                              key={tag}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery(tag);
                              }}
                              title="按标签筛选"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="task-row-actions">
                        <Button variant="subtle" size="small"
                         
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor(task);
                          }}
                        >
                          编辑
                        </Button>
                        <Button variant="subtle" size="small"
                         
                          onClick={(e) => {
                            e.stopPropagation();
                            void onArchive(task);
                          }}
                          title="归档任务"
                        >
                          归档
                        </Button>
                        <IconButton
                          className="delete-task-btn small"
                          label="删除任务"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDelete(task);
                          }}
                        >
                          ×
                        </IconButton>
                      </div>
                    </article>

                    {/* Expandable Subtask List */}
                    {hasSubtasks && isExpanded && (
                      <div className="subtasks-container">
                        {subtasks.map((subtask) => (
                          <div
                            key={subtask.id}
                            className={`subtask-row ${subtask.status === "done" ? "is-done" : ""}`}
                            onClick={() => openEditor(subtask)}
                          >
                            <button
                              type="button"
                              className={`check-circle mini ${subtask.status === "done" ? "checked" : ""}`}
                              aria-label={subtask.status === "done" ? "标记为待办" : "标记为完成"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStatus(subtask);
                              }}
                            >
                              <CheckIcon mini />
                            </button>
                            <span className="subtask-title">{subtask.title}</span>
                            <span className={`priority-mini-pill ${subtask.priority}`}>
                              {priorityLabel[subtask.priority]}
                            </span>
                            {subtask.dueDate && (
                              <span className="subtask-date">{formatDate(subtask.dueDate)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        /* Kanban Board View */
        <KanbanBoard
          tasks={visibleTasks}
          projects={projects}
          onSelect={openEditor}
          onToggleStatus={toggleStatus}
          onSetStatus={setTaskStatus}
          onToggleFavorite={toggleFavorite}
          onCreate={onCreate}
          today={today}
        />
      )}

      {/* Task Editor Modal */}
      {editing && (
        <TaskEditor
          task={editing}
          projects={projects}
          tasks={tasks}
          onClose={closeEditor}
          onUpdate={async (updatedTask) => {
            await onUpdate(updatedTask);
            closeEditor();
          }}
          onArchive={async (archivedTask) => {
            await onArchive(archivedTask);
            closeEditor();
          }}
          onMoveSpace={async (movedTask, nextSpace) => {
            await onMoveSpace(movedTask, nextSpace);
            closeEditor();
          }}
          onDelete={async (deletedTask) => {
            await onDelete(deletedTask);
            closeEditor();
          }}
        />
      )}
    </div>
  );
}

/* Kanban Board Sub-component */
function KanbanBoard({
  tasks,
  projects,
  onSelect,
  onToggleStatus,
  onSetStatus,
  onToggleFavorite,
  onCreate,
  today,
}: {
  tasks: Task[];
  projects: Project[];
  onSelect: (task: Task) => void;
  onToggleStatus: (task: Task) => void;
  onSetStatus: (task: Task, status: TaskStatus) => void;
  onToggleFavorite: (task: Task) => void;
  onCreate: (kind: CreateKind) => void;
  today: string;
}) {
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const columns: { status: TaskStatus; label: string; dotClass: string }[] = [
    { status: "todo", label: "待处理", dotClass: "status-dot-todo" },
    { status: "in_progress", label: "进行中", dotClass: "status-dot-in-progress" },
    { status: "waiting", label: "等待中", dotClass: "status-dot-waiting" },
    { status: "done", label: "已完成", dotClass: "status-dot-done" },
  ];

  return (
    <div className="task-kanban-board">
      {columns.map(({ status, label, dotClass }) => {
        const columnTasks = tasks.filter((t) => t.status === status);

        return (
          <div key={status} className="kanban-column">
            <div className="kanban-column-header">
              <div className="kanban-column-title">
                <span className={`kanban-dot ${dotClass}`} />
                <h3>{label}</h3>
                <span className="column-count">{columnTasks.length}</span>
              </div>
              <button
                type="button"
                className="kanban-add-btn"
                onClick={() => onCreate("task")}
                title={`新建 ${label} 任务`}
              >
                ＋
              </button>
            </div>

            <div className="kanban-card-list">
              {columnTasks.length === 0 ? (
                <div className="kanban-column-empty">暂无任务</div>
              ) : (
                columnTasks.map((task) => {
                  const isOverdue = isTaskOverdue(task, today);
                  const isDueToday = isTaskDueToday(task, today);
                  const project = task.projectId ? projectMap.get(task.projectId) : null;

                  return (
                    <article
                      key={task.id}
                      className={`kanban-card ${task.status === "done" ? "is-done" : ""} ${isOverdue ? "is-overdue" : ""}`}
                      onClick={() => onSelect(task)}
                    >
                      <div className="kanban-card-top">
                        <button
                          type="button"
                          className={`check-circle mini ${task.status === "done" ? "checked" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleStatus(task);
                          }}
                        >
                          <CheckIcon mini />
                        </button>

                        <button
                          type="button"
                          className={`star-button mini ${task.favorite ? "is-favorite" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(task);
                          }}
                        >
                          {task.favorite ? "★" : "☆"}
                        </button>

                        <span className={`priority-mini-pill ${task.priority}`}>
                          {priorityLabel[task.priority]}
                        </span>
                      </div>

                      <strong className="kanban-card-title">{task.title}</strong>

                      {task.description && (
                        <p className="kanban-card-desc">{task.description}</p>
                      )}

                      <div className="kanban-card-meta">
                        {project && (
                          <span className="kanban-project-pill" title={project.name}>
                            📁 {project.name}
                          </span>
                        )}

                        {task.dueDate && (
                          <span
                            className={`due-date-pill mini ${isOverdue ? "overdue" : isDueToday ? "today" : ""}`}
                          >
                            📅 {isOverdue ? "已逾期" : isDueToday ? "今天" : formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>

                      {/* Quick column moving shortcuts */}
                      <div className="kanban-card-actions" onClick={(e) => e.stopPropagation()}>
                        {status !== "todo" && (
                          <button
                            type="button"
                            className="kanban-shift-btn"
                            onClick={() => onSetStatus(task, "todo")}
                            title="移至待办"
                          >
                            ← 待办
                          </button>
                        )}
                        {status !== "in_progress" && (
                          <button
                            type="button"
                            className="kanban-shift-btn"
                            onClick={() => onSetStatus(task, "in_progress")}
                            title="移至进行中"
                          >
                            进行中 →
                          </button>
                        )}
                        {status !== "done" && (
                          <button
                            type="button"
                            className="kanban-shift-btn success"
                            onClick={() => onSetStatus(task, "done")}
                            title="标记完成"
                          >
                            <CheckIcon mini className="inline-check-icon mini" /> 完成
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Enhanced Task Editor Dialog */
function TaskEditor({
  task,
  projects,
  tasks,
  onClose,
  onUpdate,
  onArchive,
  onMoveSpace,
  onDelete,
}: {
  task: Task;
  projects: Project[];
  tasks: Task[];
  onClose: () => void;
  onUpdate: (task: Task) => Promise<void>;
  onArchive: (task: Task) => Promise<void>;
  onMoveSpace: (task: Task, space: ContentSpace) => void | Promise<unknown>;
  onDelete: (task: Task) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [parentId, setParentId] = useState(task.parentId ?? "");
  const [tags, setTags] = useState(task.tags.join(" "));
  const [favorite, setFavorite] = useState(task.favorite);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Subtasks belonging to this task
  const subtasks = useMemo(() => {
    return tasks.filter((t) => t.parentId === task.id && !t.archived);
  }, [tasks, task.id]);

  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setPriority(task.priority);
    setDueDate(task.dueDate ?? "");
    setProjectId(task.projectId ?? "");
    setParentId(task.parentId ?? "");
    setTags(task.tags.join(" "));
    setFavorite(task.favorite);
    setError("");
  }, [task]);

  // Handle keyboard shortcuts: Cmd/Ctrl + Enter to save, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        void submit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [title, description, status, priority, dueDate, projectId, parentId, tags, favorite]);

  const submit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (!title.trim()) {
      setError("任务标题不能为空");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      await onUpdate({
        ...task,
        title: title.trim(),
        description,
        status,
        priority,
        dueDate: dueDate || null,
        projectId: projectId || null,
        parentId: parentId || null,
        tags: parseTags(tags),
        favorite,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setIsSaving(false);
    }
  };

  const archive = async () => {
    try {
      await onArchive(task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  // Quick set due date helpers
  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setDueDate(`${yyyy}-${mm}-${dd}`);
  };

  // Quick add subtask inside editor
  const handleAddSubtask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const stTitle = newSubtaskTitle.trim();
    if (!stTitle) return;

    try {
      await api.createTask({
        title: stTitle,
        space: task.space,
        priority: task.priority,
        parentId: task.id,
        projectId: task.projectId,
        status: "todo",
      });
      setNewSubtaskTitle("");
    } catch (err) {
      console.error("Failed to add subtask:", err);
    }
  };

  return (
    <DialogLayer onClose={onClose}>
      <form className="modal-card task-editor-card" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">任务详情</span>
            <h2>编辑任务</h2>
          </div>
          <div className="modal-header-tools">
            <button
              type="button"
              className={`star-button large ${favorite ? "is-favorite" : ""}`}
              aria-label={favorite ? "取消星标" : "标记为星标任务"}
              onClick={() => setFavorite(!favorite)}
              title={favorite ? "取消星标" : "标记为星标任务"}
            >
              {favorite ? "★" : "☆"}
            </button>
            <IconButton className="close-button" label="关闭" onClick={onClose}>
              ×
            </IconButton>
          </div>
        </div>

        <div className="modal-body">
          <label>
          标题
          <TextField
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="任务标题"
            required
          />
        </label>

        <label>
          描述与步骤
          <TextArea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            placeholder="补充完成任务所需的背景、步骤或相关链接..."
          />
        </label>

        <div className="form-grid">
          <label>
            状态
            <SelectField
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              <option value="todo">待处理</option>
              <option value="in_progress">进行中</option>
              <option value="waiting">等待中</option>
              <option value="done">已完成</option>
              <option value="cancelled">已取消</option>
            </SelectField>
          </label>

          <label>
            优先级
            <SelectField
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              <option value="urgent">紧急</option>
              <option value="high">高</option>
              <option value="normal">普通</option>
              <option value="low">低</option>
            </SelectField>
          </label>
        </div>

        <div className="form-grid">
          <label>
            截止日期
            <div className="date-field-group">
              <TextField
                type="date"
                value={dueDate}
                onChange={(event) => {
                  setDueDate(event.target.value);
                  event.currentTarget.blur();
                }}
              />
              <div className="quick-date-chips">
                <button type="button" onClick={() => setQuickDate(0)}>
                  今天
                </button>
                <button type="button" onClick={() => setQuickDate(1)}>
                  明天
                </button>
                <button type="button" onClick={() => setQuickDate(7)}>
                  下周
                </button>
                {dueDate && (
                  <button type="button" className="clear-date" onClick={() => setDueDate("")}>
                    清除
                  </button>
                )}
              </div>
            </div>
          </label>

          <label>
            所属项目
            <SelectField
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">不关联项目</option>
              {projects
                .filter((project) => project.space === task.space && !project.archived)
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </SelectField>
          </label>
        </div>

        <label>
          父任务
          <SelectField
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">无父任务 (作为独立主任务)</option>
            {tasks
              .filter(
                (candidate) =>
                  candidate.id !== task.id &&
                  candidate.space === task.space &&
                  !candidate.archived &&
                  candidate.parentId !== task.id // prevent immediate circular reference
              )
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
          </SelectField>
        </label>

        {/* Subtasks Section */}
        <div className="editor-subtasks-section">
          <div className="section-label-row">
            <span>子任务 ({subtasks.length})</span>
            {subtasks.length > 0 && (
              <small className="muted">
                {subtasks.filter((s) => s.status === "done").length} / {subtasks.length} 已完成
              </small>
            )}
          </div>

          <div className="editor-subtask-list">
            {subtasks.map((st) => (
              <div key={st.id} className="editor-subtask-item">
                <button
                  type="button"
                  className={`check-circle mini ${st.status === "done" ? "checked" : ""}`}
                  onClick={async () => {
                    await api.updateTask({
                      ...st,
                      status: st.status === "done" ? "todo" : "done",
                    });
                  }}
                >
                  <CheckIcon mini />
                </button>
                <span className={st.status === "done" ? "completed-text" : ""}>
                  {st.title}
                </span>
                <button
                  type="button"
                  className="remove-subtask-btn"
                  title="解除子任务关联"
                  onClick={async () => {
                    await api.updateTask({ ...st, parentId: null });
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="add-subtask-row">
            <TextField
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddSubtask();
                }
              }}
              placeholder="输入子任务标题，按 Enter 快速添加..."
            />
            <Button variant="secondary" className="compact"
             
              onClick={() => void handleAddSubtask()}
              disabled={!newSubtaskTitle.trim()}
            >
              添加子任务
            </Button>
          </div>
        </div>

        <label>
          标签
          <TextField
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="#重要  #工作流  #复盘"
          />
        </label>

        {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-actions">
          <SpaceMoveButton
            space={task.space}
            onMove={(nextSpace) =>
              onMoveSpace(
                {
                  ...task,
                  title: title.trim() || task.title,
                  description,
                  status,
                  priority,
                  dueDate: dueDate || null,
                  projectId: projectId || null,
                  parentId: parentId || null,
                  tags: parseTags(tags),
                  favorite,
                },
                nextSpace,
              )
            }
          />
          <Button variant="danger" size="small"
           
            onClick={() => void handleDelete()}
            title="删除任务"
          >
            删除
          </Button>
          <Button variant="subtle" size="small"
           
            onClick={() => void archive()}
            title="归档任务"
          >
            归档
          </Button>
          <span className="flex-spacer" />
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" disabled={isSaving}>
            {isSaving ? "保存中..." : "保存 (Ctrl+Enter)"}
          </Button>
        </div>
      </form>
    </DialogLayer>
  );
}

