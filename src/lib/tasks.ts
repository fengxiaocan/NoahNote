import type { Task } from "../types";

export type TaskSort = "due_date" | "priority" | "updated_at" | "title";

const priorityRank: Record<Task["priority"], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  return [...tasks].sort((left, right) => {
    if (sort === "priority") {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }
    if (sort === "title") {
      return left.title.localeCompare(right.title, "zh-CN");
    }
    if (sort === "updated_at") {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    if (left.dueDate === null && right.dueDate !== null) return 1;
    if (left.dueDate !== null && right.dueDate === null) return -1;
    return (left.dueDate ?? "").localeCompare(right.dueDate ?? "");
  });
}
