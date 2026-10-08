// @ts-nocheck
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("NoahNote Design System - Tokens and UI Harmonization", () => {
  const tokensCssPath = path.resolve(__dirname, "tokens.css");
  const appCssPath = path.resolve(__dirname, "app.css");
  const commandCssPath = path.resolve(__dirname, "command.css");

  const tokensCss = fs.readFileSync(tokensCssPath, "utf-8");
  const appCss = fs.readFileSync(appCssPath, "utf-8");
  const commandCss = fs.readFileSync(commandCssPath, "utf-8");

  it("defines standard semantic color tokens in :root and dark theme", () => {
    // Light tokens
    expect(tokensCss).toContain("--page-bg:");
    expect(tokensCss).toContain("--surface:");
    expect(tokensCss).toContain("--surface-soft:");
    expect(tokensCss).toContain("--ink:");
    expect(tokensCss).toContain("--text:");
    expect(tokensCss).toContain("--muted:");
    expect(tokensCss).toContain("--line:");
    expect(tokensCss).toContain("--field:");
    expect(tokensCss).toContain("--accent:");
    expect(tokensCss).toContain("--danger:");
    expect(tokensCss).toContain("--green:");
    expect(tokensCss).toContain("--modal-backdrop:");
    expect(tokensCss).toContain("--modal-shadow:");

    // Dark theme override block
    expect(tokensCss).toContain('html[data-theme="dark"]');
    const darkBlock = tokensCss.slice(tokensCss.indexOf('html[data-theme="dark"]'));
    expect(darkBlock).toContain("--page-bg:");
    expect(darkBlock).toContain("--surface:");
    expect(darkBlock).toContain("--ink:");
    expect(darkBlock).toContain("--modal-backdrop:");
    expect(darkBlock).toContain("--modal-shadow:");
  });

  it("strictly defines the 5-level radius system in tokens", () => {
    expect(tokensCss).toContain("--radius-xs: 4px;");
    expect(tokensCss).toContain("--radius-sm: 8px;");
    expect(tokensCss).toContain("--radius-md: 12px;");
    expect(tokensCss).toContain("--radius-lg: 16px;");
    expect(tokensCss).toContain("--radius-xl: 20px;");
    expect(tokensCss).toContain("--radius-full: 9999px;");
  });

  it("strictly defines 4/8 grid spacing tokens", () => {
    expect(tokensCss).toContain("--space-1: 4px;");
    expect(tokensCss).toContain("--space-2: 8px;");
    expect(tokensCss).toContain("--space-3: 12px;");
    expect(tokensCss).toContain("--space-4: 16px;");
    expect(tokensCss).toContain("--space-5: 20px;");
    expect(tokensCss).toContain("--space-6: 24px;");
    expect(tokensCss).toContain("--space-8: 32px;");
  });

  it("enforces button specifications (constant height, no-wrap, ellipsis)", () => {
    // Constant height and no line break
    expect(appCss).toContain("white-space: nowrap;");
    expect(appCss).toContain("text-overflow: ellipsis;");
    expect(appCss).toContain("--button-height-md");
    expect(appCss).toContain("--button-height-sm");
  });

  it("enforces modal dialog 3-stage architecture (fixed header, scrollable body, fixed footer)", () => {
    // Header fixed
    expect(appCss).toMatch(/\.modal-heading\s*\{[^}]*flex-shrink:\s*0/);

    // Body scrollable with min-height 0 for proper flex containment
    expect(appCss).toMatch(/\.modal-body\s*\{[^}]*overflow-y:\s*auto/);
    expect(appCss).toMatch(/\.modal-body\s*\{[^}]*min-height:\s*0/);

    // Footer fixed
    expect(appCss).toMatch(/\.modal-actions\s*\{[^}]*flex-shrink:\s*0/);

    // Modal container has radius-xl and shadow-modal
    expect(appCss).toContain("border-radius: var(--radius-xl, 20px);");
  });

  it("has responsive adaptations for small screens under 440px/600px", () => {
    expect(appCss).toContain("@media (max-width: 600px)");
    expect(appCss).toContain("@media (max-width: 440px)");
    // Under 440px, footer stacks cleanly
    expect(appCss).toContain("flex-direction: column-reverse;");
  });

  it("command palette uses unified design system tokens", () => {
    expect(commandCss).toContain("border-radius: var(--radius-xl, 20px);");
    expect(commandCss).toContain("box-shadow: var(--modal-shadow);");
    expect(commandCss).toContain("overflow-y: auto;");
  });
});
