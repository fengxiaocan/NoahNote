import { useEffect, useRef, useState, useCallback } from "react";
import type { SaveType } from "../types";

export interface AutoSaveConfig {
  enabled: boolean;
  intervalSeconds: number;
  isDirty: boolean;
  onSave: (type: SaveType) => void | Promise<void>;
  onTick?: (countdown: number) => void;
  onStatusChange?: (isSaving: boolean) => void;
  onSaved?: (date: Date, type: SaveType) => void;
}

/**
 * Pure manager for timed auto-save logic, easily testable in any environment.
 */
export class AutoSaveManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private countdown: number = 15;
  private config: AutoSaveConfig;
  private isAutoSaving: boolean = false;

  constructor(config: AutoSaveConfig) {
    this.config = config;
    this.countdown = config.intervalSeconds;
    if (config.enabled && config.isDirty) {
      this.start();
    }
  }

  updateConfig(newConfig: Partial<AutoSaveConfig>) {
    const wasDirty = this.config.isDirty;
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...newConfig };

    if (!this.config.enabled || !this.config.isDirty) {
      this.stop();
      this.countdown = this.config.intervalSeconds;
      this.config.onTick?.(this.countdown);
      return;
    }

    if ((!wasDirty && this.config.isDirty) || (!wasEnabled && this.config.enabled) || !this.timer) {
      this.start();
    }
  }

  start() {
    this.stop();
    if (!this.config.enabled || !this.config.isDirty) return;
    this.countdown = this.config.intervalSeconds;
    this.config.onTick?.(this.countdown);

    this.timer = setInterval(() => {
      this.tick();
    }, 1000);
  }

  tick() {
    if (!this.config.enabled || !this.config.isDirty) {
      this.stop();
      return;
    }
    this.countdown -= 1;
    this.config.onTick?.(this.countdown);

    if (this.countdown <= 0) {
      this.triggerAutoSave();
      this.countdown = this.config.intervalSeconds;
      this.config.onTick?.(this.countdown);
    }
  }

  triggerAutoSave() {
    if (this.isAutoSaving) return;
    this.isAutoSaving = true;
    this.config.onStatusChange?.(true);

    try {
      const result = this.config.onSave("auto");
      if (result instanceof Promise) {
        result
          .then(() => {
            this.config.onSaved?.(new Date(), "auto");
          })
          .finally(() => {
            this.isAutoSaving = false;
            this.config.onStatusChange?.(false);
          });
      } else {
        this.config.onSaved?.(new Date(), "auto");
        this.isAutoSaving = false;
        this.config.onStatusChange?.(false);
      }
    } catch {
      this.isAutoSaving = false;
      this.config.onStatusChange?.(false);
    }
  }

  markSaved(type: SaveType) {
    this.countdown = this.config.intervalSeconds;
    this.config.onSaved?.(new Date(), type);
    this.config.onTick?.(this.countdown);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getCountdown(): number {
    return this.countdown;
  }

  getIsSaving(): boolean {
    return this.isAutoSaving;
  }
}

export interface UseAutoSaveOptions {
  enabled: boolean;
  intervalSeconds: number;
  isDirty: boolean;
  onSave: (type: SaveType) => void | Promise<void>;
  entityId: string;
}

export interface UseAutoSaveReturn {
  lastSavedAt: Date | null;
  lastSaveType: SaveType | null;
  isAutoSaving: boolean;
  countdown: number;
  markSaved: (type: SaveType) => void;
  resetCountdown: () => void;
}

export function useAutoSave({
  enabled,
  intervalSeconds,
  isDirty,
  onSave,
  entityId,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastSaveType, setLastSaveType] = useState<SaveType | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [countdown, setCountdown] = useState<number>(intervalSeconds);

  const prevEntityIdRef = useRef(entityId);
  const managerRef = useRef<AutoSaveManager | null>(null);

  // Initialize or update manager
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new AutoSaveManager({
        enabled,
        intervalSeconds,
        isDirty,
        onSave,
        onTick: setCountdown,
        onStatusChange: setIsAutoSaving,
        onSaved: (date, type) => {
          setLastSavedAt(date);
          setLastSaveType(type);
        },
      });
    } else {
      managerRef.current.updateConfig({
        enabled,
        intervalSeconds,
        isDirty,
        onSave,
        onTick: setCountdown,
        onStatusChange: setIsAutoSaving,
        onSaved: (date, type) => {
          setLastSavedAt(date);
          setLastSaveType(type);
        },
      });
    }
  }, [enabled, intervalSeconds, isDirty, onSave]);

  // Reset when entityId changes
  useEffect(() => {
    if (prevEntityIdRef.current !== entityId) {
      prevEntityIdRef.current = entityId;
      setLastSavedAt(null);
      setLastSaveType(null);
      setIsAutoSaving(false);
      setCountdown(intervalSeconds);
      managerRef.current?.stop();
      managerRef.current?.updateConfig({ enabled, intervalSeconds, isDirty, onSave });
    }
  }, [entityId, intervalSeconds, enabled, isDirty, onSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.stop();
    };
  }, []);

  const markSaved = useCallback(
    (type: SaveType) => {
      managerRef.current?.markSaved(type);
      setLastSavedAt(new Date());
      setLastSaveType(type);
      setIsAutoSaving(false);
      setCountdown(intervalSeconds);
    },
    [intervalSeconds]
  );

  const resetCountdown = useCallback(() => {
    setCountdown(intervalSeconds);
    managerRef.current?.start();
  }, [intervalSeconds]);

  return {
    lastSavedAt,
    lastSaveType,
    isAutoSaving,
    countdown,
    markSaved,
    resetCountdown,
  };
}
