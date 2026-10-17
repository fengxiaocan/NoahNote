import { describe, expect, it } from "vitest";
import type { Bug } from "../types";
import { calculateBugStats, filterAndSortBugs, isBugDueToday, isBugOverdue } from "./bugs";

function bug(overrides: Partial<Bug> = {}): Bug {
  return {
    schemaVersion: 1,
    id: "bug-1",
    code: "BUG-000000000001",
    title: "编辑器冻结",
    description: "",
    notes: "",
    environment: "",
    status: "todo",
    priority: "p2",
    severity: "s2",
    bugDate: "2026-10-16",
    dueDate: null,
    completedDate: null,
    space: "personal",
    projectId: null,
    module: "编辑器",
    version: "",
    assignee: "",
    reporter: "",
    tags: [],
    resolution: null,
    reopenCount: 0,
    favorite: false,
    archived: false,
    activities: [],
    source: { kind: "manual", batchId: null, rowId: null, lineNumber: null, copiedFromId: null },
    createdAt: "2026-10-16T09:00:00Z",
    updatedAt: "2026-10-16T09:00:00Z",
    deviceId: "device-1",
    workspaceId: "workspace-1",
    revision: 1,
    ...overrides,
  };
}

describe("BUG due dates and completion stats", () => {
  it("treats today as due today but not overdue", () => {
    const dueToday = bug({ dueDate: "2026-10-16" });
    expect(isBugDueToday(dueToday, "2026-10-16")).toBe(true);
    expect(isBugOverdue(dueToday, "2026-10-16")).toBe(false);
  });

  it("excludes completed and cancelled bugs from overdue", () => {
    expect(isBugOverdue(bug({ dueDate: "2026-10-15", status: "done" }), "2026-10-16")).toBe(false);
    expect(isBugOverdue(bug({ dueDate: "2026-10-15", status: "cancelled" }), "2026-10-16")).toBe(false);
  });

  it("excludes cancelled bugs from the completion-rate denominator", () => {
    const stats = calculateBugStats([
      bug({ id: "todo" }),
      bug({ id: "done", status: "done", completedDate: "2026-10-16" }),
      bug({ id: "cancelled", status: "cancelled", resolution: { reason: "not_bug", note: "", duplicateOfId: null, duplicateCode: null, duplicateTitle: null } }),
    ], "2026-10-16");

    expect(stats.total).toBe(3);
    expect(stats.cancelled).toBe(1);
    expect(stats.completionRate).toBe(50);
  });

  it("sorts overdue work first, then higher priority, then the stable ID", () => {
    const ordered = filterAndSortBugs([
      bug({ id: "priority", dueDate: "2026-10-20", priority: "p0" }),
      bug({ id: "overdue", dueDate: "2026-10-15", priority: "p3" }),
      bug({ id: "later", dueDate: "2026-10-20", priority: "p2" }),
    ], {}, "2026-10-16");

    expect(ordered.map((item) => item.id)).toEqual(["overdue", "priority", "later"]);
  });

  it("filters by activity text, status, and a date range together", () => {
    const issues = [
      bug({ id: "match", status: "in_progress", bugDate: "2026-10-15", activities: [{ id: "a", kind: "comment_added", occurredAt: "2026-10-16T10:00:00Z", deviceId: "device-1", message: "network timeout", changes: [] }] }),
      bug({ id: "status", status: "todo", bugDate: "2026-10-15" }),
      bug({ id: "date", status: "in_progress", bugDate: "2026-10-10", activities: [{ id: "b", kind: "comment_added", occurredAt: "2026-10-16T10:00:00Z", deviceId: "device-1", message: "network timeout", changes: [] }] }),
    ];

    const result = filterAndSortBugs(issues, { search: "timeout", statuses: ["in_progress"], dateField: "bug_date", dateFrom: "2026-10-14", dateTo: "2026-10-16" }, "2026-10-16");
    expect(result.map((item) => item.id)).toEqual(["match"]);
  });
});
