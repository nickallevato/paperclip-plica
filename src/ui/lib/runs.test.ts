import { describe, expect, it } from "vitest";
import { elapsedLabel, isRunActive, runNarration } from "./runs";

const run = (overrides: Record<string, unknown>) =>
  ({
    id: "r1",
    status: "running",
    createdAt: "2026-08-21T11:00:00Z",
    startedAt: "2026-08-21T11:05:00Z",
    currentStatusMessage: null,
    lastAssistantSnippet: null,
    nextAction: null,
    triggerDetail: "trigger",
    invocationSource: "schedule",
    ...overrides,
  }) as never;

describe("run helpers", () => {
  it("prefers the live status message, then next action, then the issue title", () => {
    const issue = { title: "Write the report" } as never;
    expect(runNarration(run({ lastAssistantSnippet: "I've drafted section 2 and am checking the figures.", currentStatusMessage: "tool: read_file" }), issue)).toBe("I've drafted section 2 and am checking the figures.");
    expect(runNarration(run({ currentStatusMessage: "Drafting section 2" }), issue)).toBe("Drafting section 2");
    expect(runNarration(run({ nextAction: "Summarise findings" }), issue)).toBe("Summarise findings");
    expect(runNarration(run({}), issue)).toBe("Write the report");
    expect(runNarration(run({}), undefined)).toBe("trigger");
  });

  it("labels elapsed time from startedAt and knows which statuses are active", () => {
    const now = Date.parse("2026-08-21T12:30:00Z");
    expect(elapsedLabel(run({}), now)).toBe("1h 25m");
    expect(elapsedLabel(run({ startedAt: null, createdAt: "2026-08-21T12:20:00Z" }), now)).toBe("10m");
    expect(isRunActive(run({ status: "queued" }))).toBe(true);
    expect(isRunActive(run({ status: "completed" }))).toBe(false);
  });
});
