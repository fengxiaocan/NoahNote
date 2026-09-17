import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { sortTasks } from "./tasks";

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
});
