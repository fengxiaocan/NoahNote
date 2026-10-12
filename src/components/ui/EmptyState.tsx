import type { ReactNode } from "react";

export type EmptyStateSize = "compact" | "large" | "placeholder";

export function EmptyState({
  children,
  className = "",
  size,
}: {
  children: ReactNode;
  className?: string;
  size: EmptyStateSize;
}) {
  const legacyClass = size === "large" ? "large-empty" : size === "compact" ? "compact-empty" : "";
  return (
    <div className={["ui-empty-state", `ui-empty-state--${size}`, legacyClass, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
