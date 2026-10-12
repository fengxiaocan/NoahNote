import type { Project, Task } from "../types";

export interface ProjectTaskStats {
  total: number;
  done: number;
  todo: number;
  percentage: number;
}

export function calculateProjectTaskStats(
  tasks: Task[],
  projectId: string
): ProjectTaskStats {
  const projectTasks = tasks.filter((t) => t.projectId === projectId);
  const total = projectTasks.length;
  if (total === 0) {
    return { total: 0, done: 0, todo: 0, percentage: 0 };
  }
  const done = projectTasks.filter((t) => t.status === "done").length;
  const todo = total - done;
  const percentage = Math.round((done / total) * 100);
  return { total, done, todo, percentage };
}

export type ProjectSortOption =
  | "updated"
  | "progress-desc"
  | "progress-asc"
  | "tasks"
  | "name";

export interface ProjectFilterOptions {
  status?: string;
  search?: string;
  sortBy?: ProjectSortOption;
}

export function filterAndSortProjects(
  projects: Project[],
  tasks: Task[],
  options: ProjectFilterOptions
): Project[] {
  let result = [...projects];

  // 1. Status or Favorite filter
  if (options.status === "favorite") {
    result = result.filter((p) => p.favorite);
  } else if (options.status && options.status !== "all") {
    result = result.filter((p) => p.status === options.status);
  }

  // 2. Search filter
  const q = options.search?.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // 3. Sorting
  const sortBy = options.sortBy || "updated";
  result.sort((a, b) => {
    if (sortBy === "updated") {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (sortBy === "progress-desc") {
      return b.progress - a.progress;
    }
    if (sortBy === "progress-asc") {
      return a.progress - b.progress;
    }
    if (sortBy === "tasks") {
      const aTasks = tasks.filter(
        (t) => t.projectId === a.id && t.status !== "done"
      ).length;
      const bTasks = tasks.filter(
        (t) => t.projectId === b.id && t.status !== "done"
      ).length;
      return bTasks - aTasks;
    }
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  return result;
}
