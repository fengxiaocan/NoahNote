import { describe, expect, it } from "vitest";
import { normalizeTheme, toggleTheme, type Theme } from "./theme";

describe("theme preference", () => {
  it("falls back to light for an empty or unknown stored value", () => {
    expect(normalizeTheme(null)).toBe("light");
    expect(normalizeTheme("sepia")).toBe("light");
  });

  it("keeps supported themes and toggles between them", () => {
    const current: Theme = normalizeTheme("dark");

    expect(current).toBe("dark");
    expect(toggleTheme(current)).toBe("light");
    expect(toggleTheme("light")).toBe("dark");
  });
});
