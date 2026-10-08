import type { SVGProps } from "react";

interface CheckIconProps extends SVGProps<SVGSVGElement> {
  mini?: boolean;
}

/**
 * Pixel-perfect SVG checkmark icon for tasks and checklists.
 * Uses crisp vector paths instead of raw font characters ("✓") for consistent
 * centering, stroke width, and appearance across all platforms and themes.
 */
export function CheckIcon({ className = "check-icon", mini = false, ...props }: CheckIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={mini ? 2.8 : 2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${mini ? "mini" : ""}`.trim()}
      aria-hidden="true"
      {...props}
    >
      <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

interface ChecklistStatusIconProps extends SVGProps<SVGSVGElement> {
  isAllCompleted: boolean;
  totalItems: number;
}

/**
 * Dynamic checklist icon indicating current completion state:
 * - Completed (100%): green-filled rounded square with white checkmark
 * - In Progress: rounded square with progress lines
 * - Empty: dashed rounded square
 */
export function ChecklistStatusIcon({
  isAllCompleted,
  totalItems,
  className = "checklist-icon",
  ...props
}: ChecklistStatusIconProps) {
  if (totalItems > 0 && isAllCompleted) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        className={`${className} is-completed`.trim()}
        role="img"
        aria-label="清单所有事项已完成"
        {...props}
      >
        <rect
          x="2"
          y="2"
          width="12"
          height="12"
          rx="3.5"
          className="checklist-status-bg"
          fill="var(--green, #238969)"
          stroke="var(--green, #238969)"
          strokeWidth="1.5"
        />
        <polyline
          points="4.5 8.5 7 11 11.5 5.5"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (totalItems > 0) {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        className={`${className} in-progress`.trim()}
        role="img"
        aria-label="清单进行中"
        {...props}
      >
        <rect x="2" y="2" width="12" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
        <line x1="5.5" y1="6" x2="10.5" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="5.5" y1="9" x2="9.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      className={`${className} is-empty`.trim()}
      role="img"
      aria-label="空清单"
      {...props}
    >
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.5 2"
      />
    </svg>
  );
}
