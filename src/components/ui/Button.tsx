import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "subtle" | "danger";
export type ButtonSize = "small" | "medium" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({ variant = "secondary", size = "medium", className = "", type = "button", children, ...props }: ButtonProps) {
  const baseClass = size === "small" ? "small-button" : variant === "subtle" ? "text-button" : "button";
  const variantClass = variant === "danger"
    ? size === "small" ? "subtle danger" : "danger-action"
    : variant === "subtle" ? "subtle" : variant;
  const sizeClass = size === "large" ? "large" : "";
  const classes = [baseClass, variantClass, sizeClass, className].filter(Boolean).join(" ");

  return <button {...props} type={type} className={classes}>{children}</button>;
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, className = "", title, type = "button", children, ...props }: IconButtonProps) {
  return <button {...props} type={type} className={["icon-button", className].filter(Boolean).join(" ")} aria-label={label} title={title ?? label}>{children}</button>;
}
