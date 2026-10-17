import type { Bug, BugQuery, BugSortField, BugStats, BugStatus } from "../types";

export const bugStatusLabels: Record<BugStatus, string> = {
  todo: "待处理",
  in_progress: "处理中",
  blocked: "已阻塞",
  pending_verification: "待验证",
  deferred: "暂缓处理",
  done: "已完成",
  cancelled: "已取消",
};

export const bugPriorityLabels = {
  p0: "P0 紧急",
  p1: "P1 高",
  p2: "P2 普通",
  p3: "P3 低",
} as const;

export const bugSeverityLabels = {
  s0: "S0 致命",
  s1: "S1 严重",
  s2: "S2 一般",
  s3: "S3 轻微",
} as const;

const priorityRank = { p0: 0, p1: 1, p2: 2, p3: 3 } as const;
const severityRank = { s0: 0, s1: 1, s2: 2, s3: 3 } as const;
const terminal = new Set<BugStatus>(["done", "cancelled"]);

export function isBugOverdue(bug: Pick<Bug, "status" | "dueDate">, today: string): boolean {
  return Boolean(bug.dueDate && bug.dueDate < today && !terminal.has(bug.status));
}

export function isBugDueToday(bug: Pick<Bug, "status" | "dueDate">, today: string): boolean {
  return Boolean(bug.dueDate === today && !terminal.has(bug.status));
}

export function calculateBugStats(bugs: Bug[], today: string): BugStats {
  const stats: BugStats = {
    total: bugs.length,
    todo: 0,
    inProgress: 0,
    blocked: 0,
    pendingVerification: 0,
    deferred: 0,
    completed: 0,
    cancelled: 0,
    dueToday: 0,
    overdue: 0,
    favorite: 0,
    completionRate: 0,
  };

  for (const bug of bugs) {
    if (bug.status === "todo") stats.todo++;
    else if (bug.status === "in_progress") stats.inProgress++;
    else if (bug.status === "blocked") stats.blocked++;
    else if (bug.status === "pending_verification") stats.pendingVerification++;
    else if (bug.status === "deferred") stats.deferred++;
    else if (bug.status === "done") stats.completed++;
    else stats.cancelled++;

    if (bug.favorite) stats.favorite++;
    if (isBugDueToday(bug, today)) stats.dueToday++;
    if (isBugOverdue(bug, today)) stats.overdue++;
  }

  const denominator = stats.total - stats.cancelled;
  stats.completionRate = denominator > 0 ? Math.round((stats.completed / denominator) * 100) : 0;
  return stats;
}

function compareNullableDate(left: string | null, right: string | null, descending = false): number {
  if (left === null && right !== null) return 1;
  if (left !== null && right === null) return -1;
  const comparison = (left ?? "").localeCompare(right ?? "");
  return descending ? -comparison : comparison;
}

function compareBugs(left: Bug, right: Bug, sortBy: BugSortField, descending: boolean, today: string): number {
  if (sortBy === "default") {
    const active = Number(terminal.has(left.status)) - Number(terminal.has(right.status));
    if (active) return active;
    const overdue = Number(isBugOverdue(right, today)) - Number(isBugOverdue(left, today));
    if (overdue) return overdue;
    const priority = priorityRank[left.priority] - priorityRank[right.priority];
    if (priority) return priority;
    const due = compareNullableDate(left.dueDate, right.dueDate);
    if (due) return due;
    const discovery = right.bugDate.localeCompare(left.bugDate);
    if (discovery) return discovery;
    return left.id.localeCompare(right.id);
  }

  let result = 0;
  if (sortBy === "bug_date") result = compareNullableDate(left.bugDate, right.bugDate, descending);
  else if (sortBy === "due_date") result = compareNullableDate(left.dueDate, right.dueDate, descending);
  else if (sortBy === "completed_date") result = compareNullableDate(left.completedDate, right.completedDate, descending);
  else if (sortBy === "priority") result = priorityRank[left.priority] - priorityRank[right.priority];
  else if (sortBy === "severity") result = severityRank[left.severity] - severityRank[right.severity];
  else if (sortBy === "title") result = left.title.localeCompare(right.title, "zh-CN");
  else result = right.updatedAt.localeCompare(left.updatedAt);

  return (descending && !["bug_date", "due_date", "completed_date", "updated_at"].includes(sortBy)
    ? -result
    : result) || left.id.localeCompare(right.id);
}

export function filterAndSortBugs(bugs: Bug[], query: BugQuery, today: string): Bug[] {
  const normalizedSearch = query.search?.trim().toLocaleLowerCase();
  const statuses = query.statuses && query.statuses.length > 0 ? new Set(query.statuses) : null;

  return bugs
    .filter((bug) => query.includeArchived || !bug.archived)
    .filter((bug) => !statuses || statuses.has(bug.status))
    .filter((bug) => !query.priority || bug.priority === query.priority)
    .filter((bug) => !query.severity || bug.severity === query.severity)
    .filter((bug) => !query.projectId || (query.projectId === "none" ? !bug.projectId : bug.projectId === query.projectId))
    .filter((bug) => !query.module || bug.module.toLocaleLowerCase().includes(query.module.toLocaleLowerCase()))
    .filter((bug) => !query.version || bug.version.toLocaleLowerCase().includes(query.version.toLocaleLowerCase()))
    .filter((bug) => !query.assignee || bug.assignee.toLocaleLowerCase().includes(query.assignee.toLocaleLowerCase()))
    .filter((bug) => !query.tag || bug.tags.some((tag) => tag.toLocaleLowerCase() === query.tag!.toLocaleLowerCase()))
    .filter((bug) => {
      if (!normalizedSearch) return true;
      const searchable = [bug.code, bug.title, bug.description, bug.notes, bug.environment, bug.module, bug.version, bug.assignee, bug.reporter, ...bug.tags, ...bug.activities.map((item) => item.message)];
      return searchable.some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
    })
    .filter((bug) => {
      if (!query.dateField || (!query.dateFrom && !query.dateTo)) return true;
      const value = bug[query.dateField === "bug_date" ? "bugDate" : query.dateField === "due_date" ? "dueDate" : "completedDate"];
      if (!value) return false;
      return (!query.dateFrom || value >= query.dateFrom) && (!query.dateTo || value <= query.dateTo);
    })
    .sort((left, right) => compareBugs(left, right, query.sortBy ?? "default", query.descending ?? false, today));
}
