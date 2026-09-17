import { describe, expect, it } from "vitest";
import { parseTags, priorityLabel, statusLabel } from "./format";

describe("format helpers", () => {
  it("normalizes hash and comma separated tags", () => {
    expect(parseTags("#Android, Android  #重要")).toEqual(["Android", "重要"]);
  });

  it("keeps the user-facing task labels stable", () => {
    expect(statusLabel.in_progress).toBe("进行中");
    expect(priorityLabel.urgent).toBe("紧急");
  });
});
