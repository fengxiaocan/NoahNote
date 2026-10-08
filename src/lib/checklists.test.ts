import { describe, expect, it } from "vitest";
import type { Checklist } from "../types";
import {
  calculateChecklistStats,
  cloneChecklist,
  exportChecklistToMarkdown,
  filterAndSortChecklists,
  parseChecklistItemsFromText,
  removeCompletedChecklistItems,
  toggleAllChecklistItems,
} from "./checklists";

function sampleChecklist(overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: "cl-1",
    title: "版本发布清单",
    description: "每次发布生产环境前核对",
    items: [
      { id: "i-1", text: "运行单元测试", completed: true, position: 0 },
      { id: "i-2", text: "构建 Linux 安装包", completed: false, position: 1 },
      { id: "i-3", text: "验证数据库迁移脚本", completed: true, position: 2 },
    ],
    space: "work",
    tags: ["发布", "运维"],
    favorite: true,
    archived: false,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-02T12:00:00Z",
    deviceId: "device-1",
    workspaceId: "ws-1",
    revision: 1,
    ...overrides,
  };
}

describe("checklist utilities", () => {
  it("calculates checklist stats correctly", () => {
    const cl = sampleChecklist();
    const stats = calculateChecklistStats(cl);
    expect(stats.totalItems).toBe(3);
    expect(stats.completedItems).toBe(2);
    expect(stats.remainingItems).toBe(1);
    expect(stats.completionRate).toBe(67);
    expect(stats.isAllCompleted).toBe(false);

    const emptyStats = calculateChecklistStats(sampleChecklist({ items: [] }));
    expect(emptyStats.totalItems).toBe(0);
    expect(emptyStats.completionRate).toBe(0);
    expect(emptyStats.isAllCompleted).toBe(false);

    const allDoneStats = calculateChecklistStats(
      sampleChecklist({
        items: [
          { id: "1", text: "A", completed: true, position: 0 },
          { id: "2", text: "B", completed: true, position: 1 },
        ],
      })
    );
    expect(allDoneStats.isAllCompleted).toBe(true);
    expect(allDoneStats.completionRate).toBe(100);
  });

  it("filters checklists by status and search", () => {
    const list = [
      sampleChecklist({ id: "1", title: "发布清单", favorite: true }),
      sampleChecklist({
        id: "2",
        title: "行李整理",
        favorite: false,
        items: [{ id: "i1", text: "带护照", completed: true, position: 0 }],
      }),
      sampleChecklist({
        id: "3",
        title: "未完成任务",
        favorite: false,
        items: [{ id: "i2", text: "未勾选事项", completed: false, position: 0 }],
      }),
    ];

    expect(filterAndSortChecklists(list, { status: "favorite" }).map((c) => c.id)).toEqual(["1"]);
    expect(filterAndSortChecklists(list, { status: "completed" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterAndSortChecklists(list, { search: "护照" }).map((c) => c.id)).toEqual(["2"]);
  });

  it("sorts checklists by title and items count", () => {
    const list = [
      sampleChecklist({ id: "1", title: "Beta", items: [{ id: "1", text: "a", completed: false, position: 0 }] }),
      sampleChecklist({ id: "2", title: "Alpha", items: [{ id: "1", text: "a", completed: false, position: 0 }, { id: "2", text: "b", completed: false, position: 1 }] }),
    ];

    expect(filterAndSortChecklists(list, { sortBy: "title" }).map((c) => c.id)).toEqual(["2", "1"]);
    expect(filterAndSortChecklists(list, { sortBy: "items-desc" }).map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("parses text and markdown checkboxes into checklist items", () => {
    const raw = `
- [x] 第一项已完成
- [ ] 第二项待处理
* 第三项带星号
1. 第四项带数字
普通第五项
`;
    const items = parseChecklistItemsFromText(raw);
    expect(items).toHaveLength(5);
    expect(items[0].text).toBe("第一项已完成");
    expect(items[0].completed).toBe(true);
    expect(items[1].text).toBe("第二项待处理");
    expect(items[1].completed).toBe(false);
    expect(items[2].text).toBe("第三项带星号");
    expect(items[3].text).toBe("第四项带数字");
    expect(items[4].text).toBe("普通第五项");
  });

  it("exports checklist to markdown correctly", () => {
    const cl = sampleChecklist();
    const md = exportChecklistToMarkdown(cl);
    expect(md).toContain("# 版本发布清单");
    expect(md).toContain("- [x] 运行单元测试");
    expect(md).toContain("- [ ] 构建 Linux 安装包");
  });

  it("toggles all items and removes completed items", () => {
    const cl = sampleChecklist();
    const allChecked = toggleAllChecklistItems(cl.items, true);
    expect(allChecked.every((i) => i.completed)).toBe(true);

    const allUnchecked = toggleAllChecklistItems(cl.items, false);
    expect(allUnchecked.every((i) => !i.completed)).toBe(true);

    const activeOnly = removeCompletedChecklistItems(cl.items);
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0].id).toBe("i-2");
    expect(activeOnly[0].position).toBe(0);
  });

  it("clones a checklist resetting completion state for reuse", () => {
    const cl = sampleChecklist();
    const cloned = cloneChecklist(cl);
    expect(cloned.title).toBe("版本发布清单 (副本)");
    expect(cloned.items).toHaveLength(3);
    expect(cloned.items.every((i) => !i.completed)).toBe(true);
  });
});
