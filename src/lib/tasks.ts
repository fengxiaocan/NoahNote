import type { Task, TaskPriority } from "../types";
import { todayKey } from "./format";

export type TaskSort =
  | "due_date"
  | "due_date_desc"
  | "priority"
  | "priority_desc"
  | "updated_at"
  | "created_at"
  | "title";

export type TaskFilterStatus =
  | "all"
  | "todo"
  | "in_progress"
  | "waiting"
  | "done"
  | "cancelled"
  | "today"
  | "overdue"
  | "favorite";

export interface TaskStats {
  total: number;
  completed: number;
  todo: number;
  inProgress: number;
  waiting: number;
  cancelled: number;
  dueToday: number;
  overdue: number;
  favorite: number;
  completionRate: number;
}

export interface TaskFilterOptions {
  status?: TaskFilterStatus;
  priority?: string;
  projectId?: string;
  search?: string;
  sortBy?: TaskSort;
}

export interface TaskHierarchy {
  rootTasks: Task[];
  subtaskMap: Map<string, Task[]>;
}

const priorityRank: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function isTaskOverdue(task: Task, todayStr?: string): boolean {
  if (!task.dueDate) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  const today = todayStr ?? todayKey();
  return task.dueDate < today;
}

export function isTaskDueToday(task: Task, todayStr?: string): boolean {
  if (!task.dueDate) return false;
  if (task.status === "cancelled") return false;
  const today = todayStr ?? todayKey();
  return task.dueDate === today;
}

export function calculateTaskStats(tasks: Task[], todayStr?: string): TaskStats {
  const today = todayStr ?? todayKey();
  const total = tasks.length;
  let completed = 0;
  let todo = 0;
  let inProgress = 0;
  let waiting = 0;
  let cancelled = 0;
  let dueToday = 0;
  let overdue = 0;
  let favorite = 0;

  for (const task of tasks) {
    if (task.status === "done") completed++;
    else if (task.status === "todo") todo++;
    else if (task.status === "in_progress") inProgress++;
    else if (task.status === "waiting") waiting++;
    else if (task.status === "cancelled") cancelled++;

    if (task.favorite) favorite++;

    if (isTaskDueToday(task, today)) dueToday++;
    if (isTaskOverdue(task, today)) overdue++;
  }

  const activeTotal = total - cancelled;
  const completionRate = activeTotal > 0 ? Math.round((completed / activeTotal) * 100) : 0;

  return {
    total,
    completed,
    todo,
    inProgress,
    waiting,
    cancelled,
    dueToday,
    overdue,
    favorite,
    completionRate,
  };
}

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  return [...tasks].sort((left, right) => {
    if (sort === "priority") {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }
    if (sort === "priority_desc") {
      return priorityRank[right.priority] - priorityRank[left.priority];
    }
    if (sort === "title") {
      return left.title.localeCompare(right.title, "zh-CN");
    }
    if (sort === "updated_at") {
      return right.updatedAt.localeCompare(left.updatedAt);
    }
    if (sort === "created_at") {
      return right.createdAt.localeCompare(left.createdAt);
    }
    if (sort === "due_date_desc") {
      if (left.dueDate === null && right.dueDate !== null) return 1;
      if (left.dueDate !== null && right.dueDate === null) return -1;
      return (right.dueDate ?? "").localeCompare(left.dueDate ?? "");
    }

    // Default "due_date": dated tasks first, earliest first
    if (left.dueDate === null && right.dueDate !== null) return 1;
    if (left.dueDate !== null && right.dueDate === null) return -1;
    return (left.dueDate ?? "").localeCompare(right.dueDate ?? "");
  });
}

export function filterAndSortTasks(
  tasks: Task[],
  options: TaskFilterOptions,
  todayStr?: string
): Task[] {
  const today = todayStr ?? todayKey();
  let result = [...tasks];

  // 1. Status / Smart Views Filter
  const statusFilter = options.status ?? "all";
  if (statusFilter === "today") {
    result = result.filter((task) => isTaskDueToday(task, today));
  } else if (statusFilter === "overdue") {
    result = result.filter((task) => isTaskOverdue(task, today));
  } else if (statusFilter === "favorite") {
    result = result.filter((task) => task.favorite);
  } else if (statusFilter !== "all") {
    result = result.filter((task) => task.status === statusFilter);
  }

  // 2. Priority Filter
  if (options.priority && options.priority !== "all") {
    result = result.filter((task) => task.priority === options.priority);
  }

  // 3. Project Filter
  if (options.projectId && options.projectId !== "all") {
    if (options.projectId === "none") {
      result = result.filter((task) => !task.projectId);
    } else {
      result = result.filter((task) => task.projectId === options.projectId);
    }
  }

  // 4. Search Filter
  const q = options.search?.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        task.description.toLowerCase().includes(q) ||
        task.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }

  // 5. Sorting
  const sortBy = options.sortBy ?? "due_date";
  return sortTasks(result, sortBy);
}

export function buildTaskHierarchy(tasks: Task[]): TaskHierarchy {
  const taskMap = new Map<string, Task>();
  for (const t of tasks) {
    taskMap.set(t.id, t);
  }

  const subtaskMap = new Map<string, Task[]>();
  const rootTasks: Task[] = [];

  for (const task of tasks) {
    if (task.parentId && taskMap.has(task.parentId)) {
      const children = subtaskMap.get(task.parentId) ?? [];
      children.push(task);
      subtaskMap.set(task.parentId, children);
    } else {
      rootTasks.push(task);
    }
  }

  return { rootTasks, subtaskMap };
}
