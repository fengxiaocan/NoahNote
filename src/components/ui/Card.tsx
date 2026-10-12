import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article";
  children: ReactNode;
}

export function Card({ as: Element = "section", className = "", children, ...props }: CardProps) {
  return <Element {...props} className={["ui-card", className].filter(Boolean).join(" ")}>{children}</Element>;
}
