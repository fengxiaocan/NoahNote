export type Theme = "light" | "dark";

export const themeStorageKey = "noahnote-theme";

export function normalizeTheme(value: string | null | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

export function toggleTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
