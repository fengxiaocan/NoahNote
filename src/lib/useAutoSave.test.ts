import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AutoSaveManager } from "./useAutoSave";

describe("AutoSaveManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start timer or trigger auto-save when not dirty", () => {
    const onSave = vi.fn();
    const manager = new AutoSaveManager({
      enabled: true,
      intervalSeconds: 5,
      isDirty: false,
      onSave,
    });

    expect(manager.getCountdown()).toBe(5);
    expect(manager.getIsSaving()).toBe(false);

    vi.advanceTimersByTime(10000);
    expect(onSave).not.toHaveBeenCalled();
    manager.stop();
  });

  it("does not start timer or trigger auto-save when disabled even if dirty", () => {
    const onSave = vi.fn();
    const manager = new AutoSaveManager({
      enabled: false,
      intervalSeconds: 5,
      isDirty: true,
      onSave,
    });

    vi.advanceTimersByTime(10000);
    expect(onSave).not.toHaveBeenCalled();
    manager.stop();
  });

  it("counts down and triggers auto-save when enabled and dirty", () => {
    const onSave = vi.fn();
    const onTick = vi.fn();
    let savedDate: Date | null = null;
    let savedType: string | null = null;

    const manager = new AutoSaveManager({
      enabled: true,
      intervalSeconds: 3,
      isDirty: true,
      onSave,
      onTick,
      onSaved: (d, t) => {
        savedDate = d;
        savedType = t;
      },
    });

    expect(manager.getCountdown()).toBe(3);

    vi.advanceTimersByTime(1000);
    expect(manager.getCountdown()).toBe(2);
    expect(onTick).toHaveBeenCalledWith(2);

    vi.advanceTimersByTime(1000);
    expect(manager.getCountdown()).toBe(1);
    expect(onTick).toHaveBeenCalledWith(1);

    vi.advanceTimersByTime(1000);
    expect(onSave).toHaveBeenCalledWith("auto");
    expect(savedType).toBe("auto");
    expect(savedDate).toBeInstanceOf(Date);

    manager.stop();
  });

  it("supports updating config from clean to dirty", () => {
    const onSave = vi.fn();
    const manager = new AutoSaveManager({
      enabled: true,
      intervalSeconds: 3,
      isDirty: false,
      onSave,
    });

    vi.advanceTimersByTime(5000);
    expect(onSave).not.toHaveBeenCalled();

    // User edits document
    manager.updateConfig({ isDirty: true });

    vi.advanceTimersByTime(3000);
    expect(onSave).toHaveBeenCalledWith("auto");

    manager.stop();
  });

  it("resets countdown when markSaved is called", () => {
    const onSave = vi.fn();
    const manager = new AutoSaveManager({
      enabled: true,
      intervalSeconds: 10,
      isDirty: true,
      onSave,
    });

    vi.advanceTimersByTime(4000);
    expect(manager.getCountdown()).toBe(6);

    manager.markSaved("manual");
    expect(manager.getCountdown()).toBe(10);

    manager.stop();
  });
});
