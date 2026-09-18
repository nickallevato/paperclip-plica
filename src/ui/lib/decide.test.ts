import { describe, expect, it } from "vitest";
import type { AttentionFeed, Company } from "@paperclipai/shared";
import {
  decideByLabel,
  decideLane,
  deriveQueueItems,
  groupQueue,
  isDecideOverdue,
  isSnoozed,
  localDateKey,
  summarizeDecide,
  type PlicaQueueItem,
} from "./queue";
import { applyTriageOverrides } from "../components/useQueueTriage";

// Thursday 17 September 2026, 12:00 local. The week closes on Sunday the 20th.
const NOW = new Date(2026, 8, 17, 12).getTime();
const dayKey = (offset: number) => localDateKey(NOW + offset * 24 * 60 * 60_000);

const item = (overrides: Partial<PlicaQueueItem> = {}): PlicaQueueItem =>
  ({
    kind: "attention",
    id: "attention:x",
    companyId: "c1",
    bucket: "soon",
    rank: 2,
    atMs: NOW - 60_000,
    triage: { sourceKind: "blocker_attention", sourceId: "issue-1" },
    decideBy: null,
    snoozedUntil: null,
    item: { severity: "high" },
    issue: null,
    ...overrides,
  }) as PlicaQueueItem;

describe("decideLane", () => {
  it("files presets in their lanes and leaves an unset item unsorted", () => {
    expect(decideLane(item(), NOW)).toBe("unsorted");
    expect(decideLane(item({ decideBy: "today" }), NOW)).toBe("today");
    expect(decideLane(item({ decideBy: "this_week" }), NOW)).toBe("week");
    expect(decideLane(item({ decideBy: "whenever" }), NOW)).toBe("whenever");
  });

  it("files a date by the reader's calendar: past or today → Today, by Sunday → This week, later → Whenever", () => {
    expect(decideLane(item({ decideBy: dayKey(-2) }), NOW)).toBe("today");
    expect(decideLane(item({ decideBy: dayKey(0) }), NOW)).toBe("today");
    expect(decideLane(item({ decideBy: dayKey(3) }), NOW)).toBe("week"); // Sunday
    expect(decideLane(item({ decideBy: dayKey(4) }), NOW)).toBe("whenever"); // next Monday
  });

  it("puts a live snooze ahead of everything, and ignores one that has lapsed", () => {
    const later = new Date(NOW + 60 * 60_000).toISOString();
    const earlier = new Date(NOW - 60 * 60_000).toISOString();
    expect(decideLane(item({ decideBy: "today", snoozedUntil: later }), NOW)).toBe("snoozed");
    expect(decideLane(item({ decideBy: "today", snoozedUntil: earlier }), NOW)).toBe("today");
    expect(isSnoozed(item({ snoozedUntil: earlier }), NOW)).toBe(false);
  });

  it("sends Plica's own conditions, which have no triage row, to Alerts", () => {
    expect(decideLane(item({ kind: "heartbeat", triage: null } as never), NOW)).toBe("alerts");
  });

  it("only dates go overdue — a preset is always 'now'", () => {
    expect(isDecideOverdue(item({ decideBy: dayKey(-1) }), NOW)).toBe(true);
    expect(isDecideOverdue(item({ decideBy: dayKey(0) }), NOW)).toBe(false);
    expect(isDecideOverdue(item({ decideBy: "today" }), NOW)).toBe(false);
  });
});

describe("decideByLabel", () => {
  it("names presets and dates, and says nothing for unset", () => {
    expect(decideByLabel(null)).toBeNull();
    expect(decideByLabel("this_week")).toBe("This week");
    expect(decideByLabel("2026-09-25")).toMatch(/25/);
  });
});

describe("summarizeDecide", () => {
  it("counts today (with overdue), unsorted and snoozed", () => {
    const snoozed = new Date(NOW + 60 * 60_000).toISOString();
    const summary = summarizeDecide(
      [
        item({ id: "a", decideBy: "today" }),
        item({ id: "b", decideBy: dayKey(-1) }),
        item({ id: "c" }),
        item({ id: "d", decideBy: dayKey(-3), snoozedUntil: snoozed }),
        item({ id: "e", decideBy: "whenever" }),
      ],
      NOW,
    );
    // The snoozed overdue item is away, so it is not counted as overdue.
    expect(summary).toEqual({ today: 2, overdue: 1, unsorted: 1, snoozed: 1 });
  });
});

describe("groupQueue by decide-by", () => {
  it("orders the lanes, omits empty ones, and folds Whenever and Snoozed", () => {
    const company = { id: "c1", name: "C1" } as Company;
    const groups = groupQueue(
      [
        item({ id: "w", decideBy: "whenever" }),
        item({ id: "u" }),
        item({ id: "t", decideBy: "today" }),
        item({ id: "s", snoozedUntil: new Date(NOW + 60_000).toISOString() }),
      ],
      "decide",
      [company],
      { nowMs: NOW },
    );
    expect(groups.map((group) => [group.lane, group.folded])).toEqual([
      ["today", false],
      ["unsorted", false],
      ["whenever", true],
      ["snoozed", true],
    ]);
  });
});

describe("deriveQueueItems triage identity", () => {
  it("keys attention by sourceKind + subject.id, and gives an approval its feed twin's triage", () => {
    const feed = {
      items: [
        {
          id: "att-1",
          severity: "high",
          sourceKind: "blocker_attention",
          activityAt: new Date(NOW).toISOString(),
          dismissal: null,
          subject: { kind: "issue", id: "issue-9", title: "x", identifier: null, href: null },
          whyNow: "x",
          detail: null,
          decideBy: "this_week",
          snoozedUntil: null,
        },
        {
          id: "att-2",
          severity: "high",
          sourceKind: "approval",
          activityAt: new Date(NOW).toISOString(),
          dismissal: null,
          subject: { kind: "approval", id: "ap-1", title: "Hire", identifier: null, href: null },
          whyNow: "x",
          detail: null,
          decideBy: "today",
          snoozedUntil: null,
        },
      ],
    } as unknown as AttentionFeed;
    const items = deriveQueueItems({
      companyId: "c1",
      approvals: [{ id: "ap-1", createdAt: new Date(NOW) }] as never,
      attention: feed,
      agents: [],
      routines: [],
      nowMs: NOW,
    });
    const approval = items.find((entry) => entry.kind === "approval")!;
    const blocker = items.find((entry) => entry.kind === "attention")!;
    expect(approval.triage).toEqual({ sourceKind: "approval", sourceId: "ap-1" });
    expect(approval.decideBy).toBe("today");
    expect(blocker.triage).toEqual({ sourceKind: "blocker_attention", sourceId: "issue-9" });
    expect(blocker.decideBy).toBe("this_week");
    // The approval's feed twin is still not a second row.
    expect(items).toHaveLength(2);
  });
});

describe("applyTriageOverrides", () => {
  it("applies a pending decide-by or snooze, drops an archived item, and leaves the rest alone", () => {
    const items = [item({ id: "a" }), item({ id: "b", decideBy: "today" }), item({ id: "c" })];
    const out = applyTriageOverrides(items, {
      a: { decideBy: "whenever" },
      b: { decideBy: null },
      c: { archived: true },
    });
    expect(out.map((entry) => [entry.id, entry.decideBy])).toEqual([
      ["a", "whenever"],
      ["b", null],
    ]);
    expect(applyTriageOverrides(items, {})).toBe(items);
  });
});
