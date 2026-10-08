import { describe, expect, it } from "vitest";
import {
  defaultPreferences,
  loadPreferences,
  parsePreferences,
  preferencesStorageKey,
  savePreferences,
  toggleSidebarPreference,
  type StorageLike,
  type UserPreferences,
} from "./preferences";

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("preferences", () => {
  it("loads default preferences when nothing stored", () => {
    const storage = new MemoryStorage();
    const prefs = loadPreferences(storage);
    expect(prefs).toEqual(defaultPreferences);
    expect(prefs.sidebarCollapsed).toBe(false);
    expect(prefs.defaultStartupPage).toBe("overview");
    expect(prefs.autoSaveEnabled).toBe(true);
    expect(prefs.autoSaveIntervalSeconds).toBe(15);
  });

  it("saves and reloads modified preferences", () => {
    const storage = new MemoryStorage();
    const modified: UserPreferences = {
      ...defaultPreferences,
      sidebarCollapsed: true,
      sidebarCompact: true,
      defaultStartupPage: "today",
      contentWidth: "wide",
      editorFontSize: "medium",
      autoSaveEnabled: false,
      autoSaveIntervalSeconds: 30,
    };

    savePreferences(modified, storage);
    const loaded = loadPreferences(storage);
    expect(loaded.sidebarCollapsed).toBe(true);
    expect(loaded.sidebarCompact).toBe(true);
    expect(loaded.defaultStartupPage).toBe("today");
    expect(loaded.contentWidth).toBe("wide");
    expect(loaded.editorFontSize).toBe("medium");
    expect(loaded.autoSaveEnabled).toBe(false);
    expect(loaded.autoSaveIntervalSeconds).toBe(30);
  });

  it("handles corrupted or partial storage gracefully", () => {
    const storage = new MemoryStorage();
    storage.setItem(preferencesStorageKey, "invalid-json{{");
    const loaded = loadPreferences(storage);
    expect(loaded).toEqual(defaultPreferences);

    const partial = parsePreferences(JSON.stringify({ sidebarCollapsed: true }));
    expect(partial.sidebarCollapsed).toBe(true);
    expect(partial.contentWidth).toBe("standard");
  });

  it("toggles sidebar preference correctly", () => {
    const initial = defaultPreferences;
    expect(initial.sidebarCollapsed).toBe(false);

    const toggled = toggleSidebarPreference(initial);
    expect(toggled.sidebarCollapsed).toBe(true);

    const toggledBack = toggleSidebarPreference(toggled);
    expect(toggledBack.sidebarCollapsed).toBe(false);
  });
});
