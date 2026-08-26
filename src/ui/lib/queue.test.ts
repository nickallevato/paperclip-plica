import { describe, expect, it } from "vitest";
import type { AttentionFeed, Company } from "@paperclipai/shared";
import {
  compareQueueItems,
  deriveQueueItems,
  describeCron,
  flattenLiveRuns,
  groupQueue,
  ageTone,
  queueItemAge,
  upcomingProjects,
  normalizeQueueGrouping,
  summarizeQueue,
  upcomingRoutines,
  routineHeat,
  routineOutcome,
  describeCronClock,
  distinctLabel,
  groupByCompany,
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
  it("keeps only active runs, working before queued, with the issue attached", () => {
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
        runs: [
          { id: "r-waiting-long", status: "queued", startedAt: null, createdAt: at(40) },
          { id: "r-waiting-short", status: "queued", startedAt: null, createdAt: at(1) },
        ] as never,
        issues: [],
      },
    ]);
    // Working first even though both queued runs are older, then the queue
    // itself longest-waiting first.
    expect(entries.map((entry) => entry.run.id)).toEqual(["r-new", "r-waiting-long", "r-waiting-short"]);
    expect(entries.map((entry) => entry.phase)).toEqual(["working", "queued", "queued"]);
    expect(entries[0].issue).toMatchObject({ title: "Ship it" });
  });
});

describe("upcomingRoutines", () => {
  it("marks overdue and failed states, skips disabled and paused, and keeps every one", () => {
    const items = upcomingRoutines(
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
    );
    // Nothing is truncated any more — the rail groups and collapses instead.
    expect(items.map((item) => [item.routine.id, item.state])).toEqual([
      ["late", "overdue"],
      ["soon", "scheduled"],
      ["failed", "failed"],
      ["tomorrow", "scheduled"],
    ]);
  });
});

describe("describeCron", () => {
  // Times are written the way the reader's locale writes them, so the
  // expectations are built the same way rather than hardcoding 12- or
  // 24-hour output and failing on somebody else's machine.
  const t = (hour: number, minute: number) =>
    new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  it("reads the common shapes", () => {
    expect(describeCron("0 8 * * *")).toBe(`daily ${t(8, 0)}`);
    expect(describeCron("30 9 * * 1-5")).toBe(`weekdays ${t(9, 30)}`);
    expect(describeCron("0 7 * * 1")).toBe(`Mon ${t(7, 0)}`);
    expect(describeCron("0 7 * * 1,4")).toBe(`Mon, Thu ${t(7, 0)}`);
    expect(describeCron("*/30 * * * *")).toBe("every 30m");
    expect(describeCron("0 */6 * * *")).toBe("every 6h");
    expect(describeCron("15 * * * *")).toBe("hourly");
    expect(describeCron("0 9 1 * *")).toBe(`monthly on the 1 at ${t(9, 0)}`);
  });

  it("formats the clock through the locale rather than pasting the cron fields", () => {
    // The bug this guards: "0 8 * * *" rendering as the raw, zero-padded
    // "08:00" regardless of how the reader writes times.
    expect(describeCron("0 8 * * *")).not.toContain("* *");
    expect(describeCron("0 8 * * *")?.replace("daily ", "")).toBe(t(8, 0));
  });

  it("gives up on shapes it cannot read", () => {
    expect(describeCron("0 8 * 6 *")).toBeNull();
    expect(describeCron("0 8 L * *")).toBeNull();
    expect(describeCron("nonsense")).toBeNull();
    expect(describeCron(null)).toBeNull();
  });
});

describe("age grouping and ramp", () => {
  it("buckets by how long an item has waited", () => {
    const item = (minsAgo: number) =>
      deriveQueueItems({
        companyId: "c1",
        approvals: [{ id: `a-${minsAgo}`, type: "budget_increase", createdAt: new Date(at(minsAgo)), payload: {} }] as never,
        attention: undefined,
        agents: [],
        routines: [],
        nowMs: NOW,
      })[0];
    expect(queueItemAge(item(30), NOW)).toBe("today");
    expect(queueItemAge(item(3 * 24 * 60), NOW)).toBe("week");
    expect(queueItemAge(item(10 * 24 * 60), NOW)).toBe("older");
    expect(queueItemAge(item(45 * 24 * 60), NOW)).toBe("stale");
    const groups = groupQueue([item(30), item(45 * 24 * 60), item(10 * 24 * 60)], "age", [company("c1")], { nowMs: NOW });
    expect(groups.map((group) => group.key)).toEqual(["stale", "older", "today"]);
  });

  it("ramps grey → amber at a week → red at a month", () => {
    expect(ageTone(null)).toBe("fresh");
    expect(ageTone(6 * 24 * 60)).toBe("fresh");
    expect(ageTone(7 * 24 * 60)).toBe("aging");
    expect(ageTone(30 * 24 * 60)).toBe("stale");
  });
});

describe("project grouping", () => {
  it("groups attention items by the issue's project, most urgent project first, no-project last", () => {
    const items = deriveQueueItems({
      companyId: "c1",
      approvals: [{ id: "a1", type: "budget_increase", createdAt: new Date(at(5)), payload: {} }] as never,
      // the fixture uses the item id as the subject issue id
      attention: attention([
        { id: "i-2", severity: "critical" },
        { id: "i-1", severity: "high" },
      ]),
      agents: [],
      routines: [],
      issues: [
        { id: "i-1", projectId: "p-a", status: "todo" },
        { id: "i-2", projectId: "p-b", status: "todo" },
      ] as never,
      nowMs: NOW,
    });
    const groups = groupQueue(items, "project", [company("c1")], {
      projects: [{ id: "p-a", name: "Alpha" }, { id: "p-b", name: "Beta" }] as never,
    });
    expect(groups.map((group) => [group.key, group.label, group.items.length])).toEqual([
      ["p-b", "Beta", 1],
      ["p-a", "Alpha", 1],
      ["", "No project", 1],
    ]);
  });
});

  it("orders the week Sunday through Saturday, not by which fires soonest", () => {
    // NOW is a Friday. `sunday` is nearly two days out but belongs to the top
    // of the week; `saturday` fires first by the clock yet sorts after it.
    const dayAt = (dayOffset: number, hour: number) => {
      const d = new Date(NOW);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const items = upcomingRoutines(
      [
        {
          company: company("c1"),
          routines: [
            routine({ id: "saturday", triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: dayAt(1, 9) }] }),
            routine({ id: "sunday", triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: dayAt(2, 9) }] }),
            routine({ id: "sunday-late", triggers: [{ id: "t", kind: "cron", enabled: true, nextRunAt: dayAt(2, 17) }] }),
          ],
        },
      ],
      NOW,
    );
    const byDay = items.map((item) => [new Date(item.atMs).getDay(), item.routine.id] as const);
    // Sunday (0) before Saturday (6); within Sunday, morning before evening.
    expect(byDay).toEqual([[0, "sunday"], [0, "sunday-late"], [6, "saturday"]]);
  });

describe("upcomingProjects", () => {
  const project = (id: string, name: string, targetDate: string | null, status = "in_progress") =>
    ({ id, name, urlKey: id, targetDate, status, archivedAt: null }) as never;
  const issue = (id: string, projectId: string | null, status: string) => ({ id, projectId, status }) as never;

  it("lists projects with open work, nearest deadline first, undated by open count; skips finished and empty", () => {
    const today = new Date(NOW);
    const iso = (days: number) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const items = upcomingProjects(
      [
        {
          company: company("c1"),
          projects: [
            project("late", "Late", iso(-2)),
            project("soon", "Soon", iso(3)),
            project("big", "Big", null),
            project("small", "Small", null),
            project("done", "Done", iso(1), "completed"),
            project("empty", "Empty", iso(1)),
          ],
          issues: [
            issue("1", "late", "blocked"),
            issue("2", "soon", "in_progress"),
            issue("3", "big", "todo"),
            issue("4", "big", "in_review"),
            issue("5", "small", "todo"),
            issue("6", "done", "todo"),
            issue("7", "empty", "done"),
          ],
        },
      ],
      NOW,
    );
    expect(items.map((entry) => entry.project.id)).toEqual(["late", "soon", "big", "small"]);
    expect(items[0]).toMatchObject({ open: 1, blocked: 1, inProgress: 0, overdue: true });
    expect(items[2]).toMatchObject({ open: 2, inProgress: 1, blocked: 0, dueMs: null, overdue: false });
  });
});

describe("routineHeat", () => {
  const HOUR = 60 * 60_000;

  it("burns live for the hour after it fires", () => {
    expect(routineHeat({ nextAtMs: null, lastFiredAtMs: NOW - 10 * 60_000, nowMs: NOW }))
      .toEqual({ phase: "running", intensity: 1 });
  });

  it("warms toward live as the run approaches, without ever reaching it", () => {
    const far = routineHeat({ nextAtMs: NOW + 20 * HOUR, lastFiredAtMs: null, nowMs: NOW });
    const near = routineHeat({ nextAtMs: NOW + 1 * HOUR, lastFiredAtMs: null, nowMs: NOW });
    expect(far.phase).toBe("approaching");
    expect(near.intensity).toBeGreaterThan(far.intensity);
    // A routine that is merely due soon must stay dimmer than one actually running.
    expect(near.intensity).toBeLessThan(1);
  });

  it("rests when the next run is more than a day out", () => {
    expect(routineHeat({ nextAtMs: NOW + 48 * HOUR, lastFiredAtMs: null, nowMs: NOW }))
      .toEqual({ phase: "resting", intensity: 0 });
  });

  it("drops hard to rest once the live hour is over, with no afterglow", () => {
    // A finished routine is finished; how it went is the outcome mark's job,
    // and a lingering glow would compete with rows about to fire.
    expect(routineHeat({ nextAtMs: null, lastFiredAtMs: NOW - 90 * 60_000, nowMs: NOW }))
      .toEqual({ phase: "resting", intensity: 0 });
  });


  it("warms for the next run even though it only just ran", () => {
    const heat = routineHeat({ nextAtMs: NOW + 30 * 60_000, lastFiredAtMs: NOW - 5 * 60 * 60_000, nowMs: NOW });
    expect(heat.phase).toBe("approaching");
  });

  it("ignores a fired timestamp from the future rather than pinning itself live", () => {
    expect(routineHeat({ nextAtMs: NOW + 48 * HOUR, lastFiredAtMs: NOW + HOUR, nowMs: NOW }).phase).toBe("resting");
  });

  it("rests with nothing scheduled and nothing run", () => {
    expect(routineHeat({ nextAtMs: null, lastFiredAtMs: null, nowMs: NOW }))
      .toEqual({ phase: "resting", intensity: 0 });
  });
});




describe("routineOutcome", () => {
  const issue = (over: Partial<{ id: string; identifier: string | null; title: string; status: string }> = {}) =>
    ({ id: "i1", identifier: "ACM-1", title: "Nightly digest", status: "done", ...over }) as never;
  const withRun = (run: unknown, activeIssue: unknown = null) =>
    ({ lastRun: run, activeIssue }) as never;

  it("says so when a routine has never run", () => {
    expect(routineOutcome(withRun(null))).toMatchObject({ state: "never", issue: null });
  });

  it("ticks a completed run", () => {
    expect(routineOutcome(withRun({ status: "completed", linkedIssue: issue() })).state).toBe("ok");
  });

  it("flags a failed run and carries its reason", () => {
    const outcome = routineOutcome(withRun({ status: "failed", failureReason: "adapter timeout", linkedIssue: issue() }));
    expect(outcome.state).toBe("failed");
    expect(outcome.label).toContain("adapter timeout");
    expect(outcome.issue).toMatchObject({ identifier: "ACM-1" });
  });

  it("reports a blocked issue as blocked, not as a clean completion", () => {
    // The run finished; the work it created did not. That is the case worth
    // catching — a tick here would say the routine is fine when it is stuck.
    const outcome = routineOutcome(withRun({ status: "completed", linkedIssue: issue({ status: "blocked" }) }));
    expect(outcome.state).toBe("blocked");
    expect(outcome.label).toContain("ACM-1");
    expect(outcome.issue).not.toBeNull();
  });

  it("treats an issue still in flight as working", () => {
    expect(routineOutcome(withRun({ status: "issue_created", linkedIssue: issue({ status: "in_progress" }) })).state)
      .toBe("working");
  });

  it("counts a closed issue from an issue_created run as done", () => {
    expect(routineOutcome(withRun({ status: "issue_created", linkedIssue: issue({ status: "done" }) })).state).toBe("ok");
  });

  it("marks skipped and coalesced runs without alarming about them", () => {
    expect(routineOutcome(withRun({ status: "skipped" })).state).toBe("skipped");
    expect(routineOutcome(withRun({ status: "coalesced" })).state).toBe("skipped");
  });

  it("falls back to the routine's active issue when the run carries none", () => {
    const outcome = routineOutcome(withRun({ status: "issue_created" }, issue({ status: "blocked" })));
    expect(outcome.state).toBe("blocked");
    expect(outcome.issue).toMatchObject({ identifier: "ACM-1" });
  });
});

describe("describeCronClock", () => {
  const t = (hour: number, minute: number) =>
    new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  it("never names a day, whatever the schedule is", () => {
    // The rail has a weekday column; if this said days too, the column would
    // mean one thing on some rows and another on the rest.
    for (const expression of ["0 9 * * 1", "0 9 * * 1,4", "30 9 * * 1-5", "0 9 * * *", "0 9 1 * *"]) {
      expect(describeCronClock(expression)).not.toMatch(/Mon|Thu|weekday|daily|monthly/i);
    }
  });

  it("gives the clock time for any fixed-time schedule", () => {
    expect(describeCronClock("0 9 * * 1")).toBe(t(9, 0));
    expect(describeCronClock("30 9 * * 1-5")).toBe(t(9, 30));
    expect(describeCronClock("0 9 1 * *")).toBe(t(9, 0));
  });

  it("gives the interval for schedules with no single time", () => {
    expect(describeCronClock("*/30 * * * *")).toBe("every 30m");
    expect(describeCronClock("0 */6 * * *")).toBe("every 6h");
    expect(describeCronClock("15 * * * *")).toBe("hourly");
  });

  it("gives up on shapes it cannot read", () => {
    expect(describeCronClock("not a cron")).toBeNull();
    expect(describeCronClock(null)).toBeNull();
  });
});

describe("distinctLabel", () => {
  it("drops a label that just restates the routine title", () => {
    expect(distinctLabel("Series release", "Series Content Release")).toBeNull();
    expect(distinctLabel("nightly digest", "Nightly Digest")).toBeNull();
  });

  it("keeps a label that adds something", () => {
    expect(distinctLabel("after the Friday close", "Nightly Digest")).toBe("after the Friday close");
  });

  it("treats blank and missing labels as nothing to show", () => {
    expect(distinctLabel("   ", "Nightly Digest")).toBeNull();
    expect(distinctLabel(null, "Nightly Digest")).toBeNull();
  });
});

describe("groupByCompany", () => {
  const co = (id: string) => ({ id, name: id }) as never;
  const item = (companyId: string, tag: string) => ({ company: co(companyId), tag });

  it("follows the board's company order rather than the item order", () => {
    const groups = groupByCompany(
      [item("c3", "a"), item("c1", "b"), item("c2", "c"), item("c1", "d")],
      [co("c1"), co("c2"), co("c3")],
    );
    expect(groups.map((group) => group.company.id)).toEqual(["c1", "c2", "c3"]);
    expect(groups[0].items).toHaveLength(2);
  });

  it("puts companies missing from the order last instead of dropping them", () => {
    const groups = groupByCompany([item("ghost", "a"), item("c1", "b")], [co("c1")]);
    expect(groups.map((group) => group.company.id)).toEqual(["c1", "ghost"]);
  });

  it("falls back to first appearance with no order given", () => {
    const groups = groupByCompany([item("c2", "a"), item("c1", "b")]);
    expect(groups.map((group) => group.company.id)).toEqual(["c2", "c1"]);
  });
});
