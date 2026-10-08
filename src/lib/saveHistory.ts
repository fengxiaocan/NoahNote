import type { DocumentKind, DocumentVersion, SaveRecord, SaveType } from "../types";

const SAVE_TYPES_STORAGE_KEY = "noahnote_save_types_map";
const SAVE_RECORDS_STORAGE_KEY = "noahnote_local_save_records";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Record whether a specific version revision or version ID was created via auto-save or manual-save.
 */
export function recordSaveType(
  versionKey: string,
  saveType: SaveType,
  storage?: StorageLike
): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    const raw = store.getItem(SAVE_TYPES_STORAGE_KEY);
    const map: Record<string, SaveType> = raw ? JSON.parse(raw) : {};
    map[versionKey] = saveType;

    // Prune oldest entries if map grows beyond 500 items
    const keys = Object.keys(map);
    if (keys.length > 500) {
      for (const k of keys.slice(0, keys.length - 500)) {
        delete map[k];
      }
    }
    store.setItem(SAVE_TYPES_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Gracefully handle storage errors
  }
}

/**
 * Get the save type for a version key (`${entityId}_rev_${revision}` or `versionId`).
 */
export function getSaveType(versionKey: string, storage?: StorageLike): SaveType | null {
  const store = getStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(SAVE_TYPES_STORAGE_KEY);
    if (!raw) return null;
    const map: Record<string, SaveType> = JSON.parse(raw);
    return map[versionKey] || null;
  } catch {
    return null;
  }
}

/**
 * Add a local save record (useful for instant UI updates and in non-Tauri preview mode).
 */
export function addLocalSaveRecord(record: SaveRecord, storage?: StorageLike): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    const raw = store.getItem(SAVE_RECORDS_STORAGE_KEY);
    const list: SaveRecord[] = raw ? JSON.parse(raw) : [];

    // Avoid duplicates by id or entityId + revision
    const filtered = list.filter(
      (r) => !(r.id === record.id || (r.entityId === record.entityId && r.revision === record.revision))
    );
    filtered.unshift(record);

    // Limit to latest 200 records total
    if (filtered.length > 200) {
      filtered.length = 200;
    }
    store.setItem(SAVE_RECORDS_STORAGE_KEY, JSON.stringify(filtered));

    // Also record save type
    recordSaveType(`${record.entityId}_rev_${record.revision}`, record.saveType, store);
    recordSaveType(record.id, record.saveType, store);
  } catch {
    // Gracefully handle storage errors
  }
}

/**
 * Retrieve local save records for a specific entity.
 */
export function getLocalSaveRecords(entityId: string, storage?: StorageLike): SaveRecord[] {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(SAVE_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const list: SaveRecord[] = JSON.parse(raw);
    return list.filter((r) => r.entityId === entityId);
  } catch {
    return [];
  }
}

/**
 * Converts a DocumentVersion into an enriched SaveRecord.
 */
export function enrichDocumentVersion(
  version: DocumentVersion,
  saveTypeOverride?: SaveType,
  storage?: StorageLike
): SaveRecord {
  const revKey = `${version.entityId}_rev_${version.revision}`;
  const recordedType =
    saveTypeOverride ??
    getSaveType(version.id, storage) ??
    getSaveType(revKey, storage) ??
    "manual";

  const content = version.content || "";
  const lines = content ? content.split("\n").length : 0;
  const chars = content.length;
  const words = content.trim().split(/\s+/).filter(Boolean).length;

  return {
    id: version.id,
    entityId: version.entityId,
    entityKind: version.entityKind,
    title: version.title,
    content,
    createdAt: version.createdAt,
    revision: version.revision,
    saveType: recordedType,
    charCount: chars,
    lineCount: lines,
    wordCount: words,
  };
}

/**
 * Merges versions from Tauri backend with local records, producing a unified list of SaveRecords.
 */
export function mergeVersionsWithSaveRecords(
  versions: DocumentVersion[],
  entityId: string,
  storage?: StorageLike
): SaveRecord[] {
  const enrichedVersions = versions.map((v) => enrichDocumentVersion(v, undefined, storage));
  const localRecords = getLocalSaveRecords(entityId, storage);

  // Merge map keyed by revision or id
  const recordMap = new Map<string, SaveRecord>();

  for (const item of enrichedVersions) {
    recordMap.set(`rev_${item.revision}`, item);
  }

  // If local records have entries that backend doesn't have yet (e.g. just auto-saved or web demo mode)
  for (const local of localRecords) {
    const key = `rev_${local.revision}`;
    if (!recordMap.has(key)) {
      recordMap.set(key, local);
    } else {
      // Preserve saveType if local has recorded auto/manual
      const existing = recordMap.get(key)!;
      if (local.saveType) {
        existing.saveType = local.saveType;
      }
    }
  }

  const result = Array.from(recordMap.values());
  // Sort descending by created time or revision
  result.sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (isNaN(timeDiff) || timeDiff === 0) {
      return b.revision - a.revision;
    }
    return timeDiff;
  });

  return result;
}

/**
 * Filter save records by type ("all" | "auto" | "manual") and search keyword.
 */
export function filterSaveRecords(
  records: SaveRecord[],
  filter: "all" | "auto" | "manual",
  query = ""
): SaveRecord[] {
  let list = records;
  if (filter === "auto") {
    list = list.filter((r) => r.saveType === "auto");
  } else if (filter === "manual") {
    list = list.filter((r) => r.saveType === "manual");
  }

  const q = query.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q) ||
        `rev ${r.revision}`.includes(q) ||
        `修订 ${r.revision}`.includes(q)
    );
  }

  return list;
}

/**
 * Clear save records and types for testing or cleanup.
 */
export function clearSaveRecords(storage?: StorageLike): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.removeItem?.(SAVE_TYPES_STORAGE_KEY);
    store.removeItem?.(SAVE_RECORDS_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
