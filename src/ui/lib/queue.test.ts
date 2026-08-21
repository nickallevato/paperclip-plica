import { describe, expect, it } from "vitest";
import type { AttentionFeed, Company } from "@paperclipai/shared";
import {
  compareQueueItems,
  deriveQueueItems,
  flattenLiveRuns,
  groupQueue,
  normalizeQueueGrouping,
  summarizeQueue,
  upcomingRoutines,
} from "./queue";

const NOW = Date.UTC(2026, 7, 21, 12);
const at = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();
const inMins = (mins: number) => new Date(NOW + mins * 60_000).toISOString();

const attention = (
  items: Array<{ id: string; severity: string; minsAgo?: number; dismissed?: boolean; sourceKind?: string }>,
): AttentionFeed =>
  ({
    items: items.map((item) => ({
      id: item.id,
      severity: item.severity,
      sourceKind: item.sourceKind ?? "blocker_attention",
      activityAt: at(item.minsAgo ?? 5),
      dismissal: item.dismissed ? { dismissedAt: at(1) } : null,
      subject: { kind: "issue", id: item.id, title: item.id, identifier: null, href: null },
      whyNow: item.id,
      detail: null,
    })),
  }) as never;

const ceo = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "agent-ceo",
    name: "Atlas",
    role: "ceo",
    status: "active",
    lastHeartbeatAt: new Date(at(5)),
    runtimeConfig: { heartbeat: { enabled: true, intervalSec: 900 } },
    ...overrides,
  }) as never;

const routine = (overrides: Record<string, unknown>) =>
  ({
    id: "r1",
    title: "Lead sweep",
    status: "active",
    triggers: [{ id: "t1", kind: "cron", label: "hourly", enabled: true, nextRunAt: inMins(18) }],
    lastRun: null,
    ...overrides,
  }) as never;

const company = (id: string, name = id): Company => ({ id, name, issuePrefix: id.toUpperCase() }) as never;

describe("deriveQueueItems", () => {
  it("buckets approvals and critical attention as Now, high as Soon, the rest as Later", () => {
    const items = deriveQueueItems({
      companyId: "c1",
      approvals: [{ id: "a1", createdAt: new Date(at(30)) }] as never,
      attention: attention([
        { id: "crit", severity: "critical" },
        { id: "high", severity: "high" },
        { id: "med", severity: "medium" },
        { id: "low", severity: "low" },
      ]),
      agents: [],
      routines: [],
      nowMs: NOW,
    });
    const byId = Object.fromEntries(items.map((item) => [item.id, item.bucket]));
    expect(byId).toEqual({
      "approval:a1": "now",
      "attention:crit": "now",
      "attention:high": "soon",
      "attention:med": "later",
      "attention:low": "later",
    });
  });

  it("skips dismissed and approval-sourced attention items (approvals are already listed)", () => {
    const items = deriveQueueItems({
      companyId: "c1",
      approvals: [],
      attention: attention([
        { id: "gone", severity: "critical", dismissed: true },
        { id: "dup", severity: "high", sourceKind: "approval" },
      ]),
      agents: [],
      routines: [],
      nowMs: NOW,
    });
    expect(items).toEqual([]);
  });

  it("names the agent that requested an approval when it is known", () => {
    const items = deriveQueueItems({
      companyId: "c1",
      approvals: [
        { id: "a1", createdAt: new Date(at(1)), requestedByAgentId: "agent-ceo" },
        { id: "a2", createdAt: new Date(at(1)), requestedByAgentId: "ghost" },
        { id: "a3", createdAt: new Date(at(1)), requestedByAgentId: null },
      ] as never,
      attention: undefined,
      agents: [ceo()],
      routines: [],
      nowMs: NOW,
    });
    expect(items.map((item) => (item.kind === "approval" ? item.requestedBy : "?"))).toEqual(["Atlas", null, null]);
  });

  it("adds an overdue CEO heartbeat to Now, aged from the last beat", () => {
    const items = deriveQueueItems({
      companyId: "c1",
      approvals: [],
      attention: undefined,
      agents: [ceo({ lastHeartbeatAt: new Date(at(130)) })],
      routines: [],
      nowMs: NOW,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "heartbeat", bucket: "now", atMs: NOW - 130 * 60_000 });
  });

  it("ignores a CEO whose heartbeat is fine or off", () => {
    expect(
      deriveQueueItems({ companyId: "c1", approvals: [], attention: undefined, agents: [ceo()], routines: [], nowMs: NOW }),
    ).toEqual([]);
  });

  it("surfaces overdue and failing routines as Soon, preferring overdue", () => {
    const items = deriveQueueItems({
      companyId: "c1",
      approvals: [],
      attention: undefined,
      agents: [],
      routines: [
        routine({ id: "late", triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: at(45) }] }),
        routine({ id: "failed", lastRun: { status: "failed", completedAt: at(120), triggeredAt: at(125) } }),
        routine({ id: "ok" }),
        routine({ id: "paused", status: "paused", lastRun: { status: "failed" } }),
        routine({ id: "both", lastRun: { status: "failed" }, triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: at(30) }] }),
      ],
      nowMs: NOW,
    });
    expect(items.map((item) => item.id).sort()).toEqual([
      "routine:both:overdue",
      "routine:failed:failed",
      "routine:late:overdue",
    ]);
    expect(items.every((item) => item.bucket === "soon")).toBe(true);
  });
});

describe("compareQueueItems / summarizeQueue / groupQueue", () => {
  const items = deriveQueueItems({
    companyId: "c1",
    approvals: [{ id: "a1", createdAt: new Date(at(30)) }] as never,
    attention: attention([
      { id: "crit", severity: "critical", minsAgo: 10 },
      { id: "high-old", severity: "high", minsAgo: 500 },
      { id: "high-new", severity: "high", minsAgo: 5 },
      { id: "low", severity: "low", minsAgo: 900 },
    ]),
    agents: [ceo({ lastHeartbeatAt: new Date(at(200)) })],
    routines: [],
    nowMs: NOW,
  });

  it("orders Now before Soon before Later, critical before approvals, then oldest first", () => {
    const sorted = [...items].sort(compareQueueItems).map((item) => item.id);
    expect(sorted).toEqual([
      "attention:crit",
      "heartbeat:agent-ceo",
      "approval:a1",
      "attention:high-old",
      "attention:high-new",
      "attention:low",
    ]);
  });

  it("summarises counts and the oldest Now/Soon age (Later is excluded from oldest)", () => {
    expect(summarizeQueue(items, NOW)).toEqual({ now: 3, soon: 2, later: 1, total: 6, oldestMins: 500 });
  });

  it("groups by bucket, dropping empty buckets", () => {
    const groups = groupQueue(items.filter((item) => item.bucket !== "soon"), "severity", [company("c1")]);
    expect(groups.map((group) => [group.key, group.items.length])).toEqual([["now", 3], ["later", 1]]);
  });

  it("groups by company in the given order and drops quiet companies", () => {
    const other = deriveQueueItems({
      companyId: "c2",
      approvals: [{ id: "a2", createdAt: new Date(at(1)) }] as never,
      attention: undefined,
      agents: [],
      routines: [],
      nowMs: NOW,
    });
    const groups = groupQueue([...items, ...other], "company", [company("c2", "Beta"), company("c1", "Alpha"), company("c3", "Quiet")]);
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([["Beta", 1], ["Alpha", 6]]);
  });

  it("normalises the grouping preference", () => {
    expect(normalizeQueueGrouping("company")).toBe("company");
    expect(normalizeQueueGrouping("nonsense")).toBe("severity");
    expect(normalizeQueueGrouping(null)).toBe("severity");
  });
});

describe("flattenLiveRuns", () => {
  it("keeps only active runs, longest-running first, with the issue attached", () => {
    const entries = flattenLiveRuns([
      {
        company: company("c1"),
        runs: [
          { id: "r-new", status: "running", startedAt: at(2), createdAt: at(3), issueId: "i1" },
          { id: "r-done", status: "succeeded", startedAt: at(50), createdAt: at(50) },
        ] as never,
        issues: [{ id: "i1", title: "Ship it" }] as never,
      },
      {
        company: company("c2"),
        runs: [{ id: "r-old", status: "queued", startedAt: null, createdAt: at(40) }] as never,
        issues: [],
      },
    ]);
    expect(entries.map((entry) => entry.run.id)).toEqual(["r-old", "r-new"]);
    expect(entries[1].issue).toMatchObject({ title: "Ship it" });
  });
});

describe("upcomingRoutines", () => {
  it("lists overdue routines first, then by soonest, marks failed last runs, and caps with overflow", () => {
    const { items, overflow } = upcomingRoutines(
      [
        {
          company: company("c1"),
          routines: [
            routine({ id: "soon", triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: inMins(5) }] }),
            routine({ id: "late", triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: at(30) }] }),
            routine({ id: "failed", lastRun: { status: "failed" }, triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: inMins(60) }] }),
            routine({ id: "unscheduled", triggers: [{ id: "t", kind: "cron", enabled: false, nextRunAt: inMins(1) }] }),
            routine({ id: "paused", status: "paused" }),
          ],
        },
        { company: company("c2"), routines: [routine({ id: "tomorrow", triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: inMins(1440) }] })] },
      ],
      NOW,
      3,
    );
    expect(items.map((item) => [item.routine.id, item.state])).toEqual([
      ["late", "overdue"],
      ["soon", "scheduled"],
      ["failed", "failed"],
    ]);
    expect(overflow).toBe(1);
  });
});
