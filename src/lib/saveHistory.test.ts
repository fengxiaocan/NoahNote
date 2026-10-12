import { describe, expect, it, beforeEach } from "vitest";
import {
  recordSaveType,
  getSaveType,
  addLocalSaveRecord,
  getLocalSaveRecords,
  enrichDocumentVersion,
  mergeVersionsWithSaveRecords,
  filterSaveRecords,
  clearSaveRecords,
  type StorageLike,
} from "./saveHistory";
import type { DocumentVersion, SaveRecord } from "../types";

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe("saveHistory", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("records and retrieves save type correctly", () => {
    recordSaveType("note1_rev_2", "auto", storage);
    recordSaveType("note1_rev_3", "manual", storage);

    expect(getSaveType("note1_rev_2", storage)).toBe("auto");
    expect(getSaveType("note1_rev_3", storage)).toBe("manual");
    expect(getSaveType("non_existent", storage)).toBe(null);
  });

  it("adds and retrieves local save records", () => {
    const record1: SaveRecord = {
      id: "rec_1",
      entityId: "note_100",
      entityKind: "note",
      title: "我的第一篇笔记",
      content: "# 标题\n这是正文内容",
      createdAt: new Date().toISOString(),
      revision: 1,
      saveType: "auto",
      charCount: 12,
      lineCount: 2,
      wordCount: 3,
    };

    addLocalSaveRecord(record1, storage);
    const retrieved = getLocalSaveRecords("note_100", storage);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].title).toBe("我的第一篇笔记");
    expect(retrieved[0].saveType).toBe("auto");

    // Check save type was also recorded
    expect(getSaveType("note_100_rev_1", storage)).toBe("auto");
  });

  it("enriches DocumentVersion with stats and saveType", () => {
    recordSaveType("v_123", "auto", storage);

    const docVersion: DocumentVersion = {
      id: "v_123",
      entityId: "note_abc",
      entityKind: "note",
      title: "架构方案",
      content: "line 1\nline 2\nline 3",
      snapshot: {},
      space: "personal",
      createdAt: "2026-09-29T10:00:00.000Z",
      revision: 5,
    };

    const enriched = enrichDocumentVersion(docVersion, undefined, storage);
    expect(enriched.id).toBe("v_123");
    expect(enriched.saveType).toBe("auto");
    expect(enriched.lineCount).toBe(3);
    expect(enriched.charCount).toBe(20);
  });

  it("merges backend versions with local records seamlessly", () => {
    recordSaveType("note_test_rev_1", "manual", storage);
    recordSaveType("note_test_rev_2", "auto", storage);

    const backendVersions: DocumentVersion[] = [
      {
        id: "bv_2",
        entityId: "note_test",
        entityKind: "note",
        title: "版本 2",
        content: "内容 2",
        snapshot: {},
        space: "personal",
        createdAt: "2026-09-29T12:00:00.000Z",
        revision: 2,
      },
      {
        id: "bv_1",
        entityId: "note_test",
        entityKind: "note",
        title: "版本 1",
        content: "内容 1",
        snapshot: {},
        space: "personal",
        createdAt: "2026-09-29T11:00:00.000Z",
        revision: 1,
      },
    ];

    const merged = mergeVersionsWithSaveRecords(backendVersions, "note_test", storage);
    expect(merged).toHaveLength(2);
    expect(merged[0].revision).toBe(2);
    expect(merged[0].saveType).toBe("auto");
    expect(merged[1].revision).toBe(1);
    expect(merged[1].saveType).toBe("manual");
  });

  it("filters save records by type and keyword", () => {
    const records: SaveRecord[] = [
      {
        id: "1",
        entityId: "n1",
        entityKind: "note",
        title: "Tauri 架构笔记",
        content: "Rust 与前端通信",
        createdAt: "2026-09-29T10:00:00.000Z",
        revision: 1,
        saveType: "auto",
        charCount: 15,
        lineCount: 1,
        wordCount: 4,
      },
      {
        id: "2",
        entityId: "n1",
        entityKind: "note",
        title: "React 19 特性研究",
        content: "Server Actions",
        createdAt: "2026-09-29T11:00:00.000Z",
        revision: 2,
        saveType: "manual",
        charCount: 20,
        lineCount: 1,
        wordCount: 5,
      },
      {
        id: "3",
        entityId: "n1",
        entityKind: "note",
        title: "Tauri 优化方案",
        content: "自动保存定时器",
        createdAt: "2026-09-29T12:00:00.000Z",
        revision: 3,
        saveType: "auto",
        charCount: 18,
        lineCount: 1,
        wordCount: 4,
      },
    ];

    expect(filterSaveRecords(records, "all")).toHaveLength(3);
    expect(filterSaveRecords(records, "auto")).toHaveLength(2);
    expect(filterSaveRecords(records, "manual")).toHaveLength(1);
    expect(filterSaveRecords(records, "all", "Tauri")).toHaveLength(2);
    expect(filterSaveRecords(records, "auto", "优化")).toHaveLength(1);
  });
});
