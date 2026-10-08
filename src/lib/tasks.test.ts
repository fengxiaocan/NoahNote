import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import {
  buildTaskHierarchy,
  calculateTaskStats,
  filterAndSortTasks,
  isTaskDueToday,
  isTaskOverdue,
  sortTasks,
} from "./tasks";

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-id",
    title: "任务",
    description: "",
    status: "todo",
    priority: "normal",
    dueDate: null,
    space: "personal",
    projectId: null,
    tags: [],
    parentId: null,
    favorite: false,
    archived: false,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    deviceId: "device",
    workspaceId: "workspace",
    revision: 1,
    ...overrides,
  };
}

describe("task sorting", () => {
  it("sorts dated tasks first and keeps undated tasks at the end", () => {
    const tasks = [
      task({ id: "undated", title: "无日期" }),
      task({ id: "late", title: "较晚", dueDate: "2026-09-20" }),
      task({ id: "early", title: "较早", dueDate: "2026-09-18" }),
    ];

    expect(sortTasks(tasks, "due_date").map((item) => item.id)).toEqual(["early", "late", "undated"]);
  });

  it("sorts tasks by priority from urgent to low", () => {
    const tasks = [
      task({ id: "normal", priority: "normal" }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "low", priority: "low" }),
      task({ id: "high", priority: "high" }),
    ];

    expect(sortTasks(tasks, "priority").map((item) => item.id)).toEqual(["urgent", "high", "normal", "low"]);
  });

  it("sorts tasks by title and recent update", () => {
    const tasks = [
      task({ id: "beta", title: "Beta", updatedAt: "2026-09-03T00:00:00Z" }),
      task({ id: "alpha", title: "Alpha", updatedAt: "2026-09-02T00:00:00Z" }),
      task({ id: "latest", title: "Latest", updatedAt: "2026-09-04T00:00:00Z" }),
    ];

    expect(sortTasks(tasks, "title").map((item) => item.id)).toEqual(["alpha", "beta", "latest"]);
    expect(sortTasks(tasks, "updated_at").map((item) => item.id)).toEqual(["latest", "beta", "alpha"]);
  });

  it("sorts tasks by due_date_desc and priority_desc", () => {
    const tasks = [
      task({ id: "early", dueDate: "2026-09-10", priority: "low" }),
      task({ id: "late", dueDate: "2026-09-25", priority: "urgent" }),
      task({ id: "undated", dueDate: null, priority: "normal" }),
    ];

    expect(sortTasks(tasks, "due_date_desc").map((t) => t.id)).toEqual(["late", "early", "undated"]);
    expect(sortTasks(tasks, "priority_desc").map((t) => t.id)).toEqual(["early", "undated", "late"]);
  });
});

describe("task stats and filter utilities", () => {
  const sampleTasks = [
    task({ id: "t1", title: "任务1", status: "done", dueDate: "2026-09-15", favorite: true }),
    task({ id: "t2", title: "任务2", status: "todo", dueDate: "2026-09-18", priority: "urgent", tags: ["重要"] }),
    task({ id: "t3", title: "任务3", status: "in_progress", dueDate: "2026-09-10", projectId: "proj-1" }), // overdue
    task({ id: "t4", title: "任务4", status: "cancelled", dueDate: "2026-09-01" }),
  ];

  it("calculates task stats correctly", () => {
    const stats = calculateTaskStats(sampleTasks, "2026-09-18");
    expect(stats.total).toBe(4);
    expect(stats.completed).toBe(1);
    expect(stats.todo).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.cancelled).toBe(1);
    expect(stats.dueToday).toBe(1);
    expect(stats.overdue).toBe(1); // t3 is in_progress and dueDate 09-10 < 09-18
    expect(stats.favorite).toBe(1);
    expect(stats.completionRate).toBe(33); // 1 / (4 - 1 cancelled) = 33%
  });

  it("checks isTaskOverdue and isTaskDueToday correctly", () => {
    expect(isTaskOverdue(sampleTasks[2], "2026-09-18")).toBe(true);
    expect(isTaskOverdue(sampleTasks[0], "2026-09-18")).toBe(false); // done
    expect(isTaskOverdue(sampleTasks[3], "2026-09-18")).toBe(false); // cancelled
    expect(isTaskDueToday(sampleTasks[1], "2026-09-18")).toBe(true);
  });

  it("filters tasks by status, today, overdue, and favorite", () => {
    expect(filterAndSortTasks(sampleTasks, { status: "today" }, "2026-09-18").map((t) => t.id)).toEqual(["t2"]);
    expect(filterAndSortTasks(sampleTasks, { status: "overdue" }, "2026-09-18").map((t) => t.id)).toEqual(["t3"]);
    expect(filterAndSortTasks(sampleTasks, { status: "favorite" }).map((t) => t.id)).toEqual(["t1"]);
    expect(filterAndSortTasks(sampleTasks, { status: "todo" }).map((t) => t.id)).toEqual(["t2"]);
  });

  it("filters tasks by project, priority, and search", () => {
    expect(filterAndSortTasks(sampleTasks, { projectId: "proj-1" }).map((t) => t.id)).toEqual(["t3"]);
    expect(filterAndSortTasks(sampleTasks, { priority: "urgent" }).map((t) => t.id)).toEqual(["t2"]);
    expect(filterAndSortTasks(sampleTasks, { search: "重要" }).map((t) => t.id)).toEqual(["t2"]);
  });

  it("builds task hierarchy accurately", () => {
    const hierarchyTasks = [
      task({ id: "parent1", title: "父任务 1" }),
      task({ id: "child1", title: "子任务 1", parentId: "parent1" }),
      task({ id: "child2", title: "子任务 2", parentId: "parent1" }),
      task({ id: "standalone", title: "独立任务" }),
    ];
    const { rootTasks, subtaskMap } = buildTaskHierarchy(hierarchyTasks);
    expect(rootTasks.map((t) => t.id)).toEqual(["parent1", "standalone"]);
    expect(subtaskMap.get("parent1")?.map((t) => t.id)).toEqual(["child1", "child2"]);
  });
});
