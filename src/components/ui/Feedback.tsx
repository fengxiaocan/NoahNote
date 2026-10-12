import type { ReactNode } from "react";

export function Toast({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={["ui-toast", "toast-message", className].filter(Boolean).join(" ")} role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function LoadingState({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={["ui-loading-state", "compact-empty", className].filter(Boolean).join(" ")} role="status" aria-live="polite" aria-busy="true">
      <span className="spin" aria-hidden="true">↻</span>
      <p>{label}</p>
    </div>
  );
}
