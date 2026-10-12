import type { ButtonHTMLAttributes, ReactNode } from "react";

export type SegmentedControlVariant = "filter" | "surface";

export function SegmentedControl({
  children,
  className = "",
  label,
  variant = "filter",
}: {
  children: ReactNode;
  className?: string;
  label: string;
  variant?: SegmentedControlVariant;
}) {
  return (
    <div
      className={["ui-segmented-control", `ui-segmented-control--${variant}`, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}

export function SegmentButton({
  children,
  className = "",
  selected,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & { selected: boolean }) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={selected}
      className={["ui-segment-button", className].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}

export function SelectableListItem({
  children,
  className = "",
  selected,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & { selected: boolean }) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={selected}
      className={["ui-selectable-list-item", className, selected ? "is-selected" : ""].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
