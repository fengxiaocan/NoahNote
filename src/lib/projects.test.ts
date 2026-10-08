import { describe, it, expect } from "vitest";
import {
  calculateProjectTaskStats,
  filterAndSortProjects,
} from "./projects";
import type { Project, Task } from "../types";

describe("projects utilities", () => {
  const mockProjects: Project[] = [
    {
      id: "p1",
      name: "Alpha Project",
      description: "Core infrastructure",
      status: "active",
      progress: 50,
      space: "work",
      tags: ["infra", "core"],
      favorite: true,
      archived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      deviceId: "dev1",
      workspaceId: "ws1",
      revision: 1,
    },
    {
      id: "p2",
      name: "Beta Project",
      description: "UI Redesign",
      status: "planning",
      progress: 10,
      space: "work",
      tags: ["design"],
      favorite: false,
      archived: false,
      createdAt: "2026-01-03T00:00:00Z",
      updatedAt: "2026-01-04T00:00:00Z",
      deviceId: "dev1",
      workspaceId: "ws1",
      revision: 1,
    },
  ];

  const mockTasks: Task[] = [
    {
      id: "t1",
      title: "Task 1",
      description: "",
      status: "done",
      priority: "normal",
      dueDate: null,
      space: "work",
      projectId: "p1",
      parentId: null,
      tags: [],
      favorite: false,
      archived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deviceId: "dev1",
      workspaceId: "ws1",
      revision: 1,
    },
    {
      id: "t2",
      title: "Task 2",
      description: "",
      status: "todo",
      priority: "urgent",
      dueDate: null,
      space: "work",
      projectId: "p1",
      parentId: null,
      tags: [],
      favorite: false,
      archived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      deviceId: "dev1",
      workspaceId: "ws1",
      revision: 1,
    },
  ];

  it("calculates project task stats accurately", () => {
    const stats = calculateProjectTaskStats(mockTasks, "p1");
    expect(stats.total).toBe(2);
    expect(stats.done).toBe(1);
    expect(stats.todo).toBe(1);
    expect(stats.percentage).toBe(50);

    const emptyStats = calculateProjectTaskStats(mockTasks, "p2");
    expect(emptyStats.total).toBe(0);
    expect(emptyStats.percentage).toBe(0);
  });

  it("filters projects by status and favorite", () => {
    const activeOnly = filterAndSortProjects(mockProjects, mockTasks, {
      status: "active",
    });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0].id).toBe("p1");

    const favOnly = filterAndSortProjects(mockProjects, mockTasks, {
      status: "favorite",
    });
    expect(favOnly).toHaveLength(1);
    expect(favOnly[0].id).toBe("p1");
  });

  it("searches projects by query", () => {
    const res = filterAndSortProjects(mockProjects, mockTasks, {
      search: "Redesign",
    });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("p2");
  });

  it("sorts projects by progress", () => {
    const desc = filterAndSortProjects(mockProjects, mockTasks, {
      sortBy: "progress-desc",
    });
    expect(desc[0].progress).toBe(50);

    const asc = filterAndSortProjects(mockProjects, mockTasks, {
      sortBy: "progress-asc",
    });
    expect(asc[0].progress).toBe(10);
  });
});
