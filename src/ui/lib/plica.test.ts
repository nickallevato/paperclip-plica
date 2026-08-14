import { describe, expect, it } from "vitest";
import type {
  Approval,
  AttentionFeed,
  Company,
  DashboardRunActivityDay,
  DashboardSummary,
  Project,
  Issue,
} from "@paperclipai/shared";
import {
  PLICA_ATTENTION_KINDS,
  PLICA_LAYOUT_CLASSES,
  PLICA_TOKEN_DEFAULTS,
  aggregateTokenState,
  attentionAgeMinutes,
  attentionDetailText,
  attentionKindSummary,
  bucketAttentionByAge,
  compareAttention,
  currentMonthRange,
  deriveActionable,
  deriveBriefingLine,
  deriveCeoHeartbeat,
  deriveCompanyStats,
  derivePaneHealth,
  deriveRoutineHealth,
  deriveTriageSummary,
  detectAlertEdges,
  filterFeed,
  formatAgeMinutes,
  formatCents,
  formatCountdown,
  formatTokens,
  groupAttentionByKind,
  healthLabel,
  intervalLabel,
  issueStatusLabel,
  mergeAttentionFeed,
  normalizeBarMode,
  normalizeCollapsedIds,
  normalizeLayoutMode,
  normalizePinnedIds,
  normalizeRowMode,
  normalizeSortMode,
  normalizeTokenSettings,
  normalizeViewMode,
  nudgeTitle,
  orderTriageCompanies,
  partitionHotFirst,
  relativeTimeLabel,
  selectCeo,
  selectFeedCompanies,
  selectProjectChips,
  shouldShowBriefing,
  sparklineDays,
  sumAgentTokens,
  summarizePayloadEntries,
  thresholdsFor,
  tokenState,
  type PlicaAlertSnapshot,
  worstSeverity,
} from "./plica";

function summaryWith(overrides: {
  errorAgents?: number;
  incidents?: number;
  pendingApprovals?: number;
}): DashboardSummary {
  return {
    companyId: "c1",
    agents: { active: 3, running: 1, paused: 0, error: overrides.errorAgents ?? 0 },
    tasks: { open: 4, inProgress: 2, blocked: 0, done: 10 },
    costs: { monthSpendCents: 500, monthBudgetCents: 10_000, monthUtilizationPercent: 5 },
    pendingApprovals: overrides.pendingApprovals ?? 0,
    budgets: {
      activeIncidents: overrides.incidents ?? 0,
      pendingApprovals: overrides.pendingApprovals ?? 0,
      pausedAgents: 0,
      pausedProjects: 0,
    },
    runActivity: [],
  };
}

describe("derivePaneHealth", () => {
  it("is green when nothing is wrong", () => {
    expect(derivePaneHealth(summaryWith({}))).toBe("green");
  });
  it("is amber when approvals are pending", () => {
    expect(derivePaneHealth(summaryWith({ pendingApprovals: 2 }))).toBe("amber");
  });
  it("is red on budget incident or errored agents, beating amber", () => {
    expect(derivePaneHealth(summaryWith({ incidents: 1, pendingApprovals: 2 }))).toBe("red");
    expect(derivePaneHealth(summaryWith({ errorAgents: 1 }))).toBe("red");
  });
  it("is green while summary is undefined (loading)", () => {
    expect(derivePaneHealth(undefined)).toBe("green");
  });
});

describe("selectProjectChips", () => {
  const project = (id: string, updatedAt: string, status = "active") =>
    ({ id, name: id, status, updatedAt: new Date(updatedAt), archivedAt: null }) as Project;
  const issue = (projectId: string | null, status: string) =>
    ({ id: `${projectId}-${status}-${Math.random().toString(36).slice(2)}`, projectId, status }) as Issue;

  it("counts open issues per project, excluding done and cancelled", () => {
    const { chips } = selectProjectChips(
      [project("p1", "2026-07-01")],
      [issue("p1", "todo"), issue("p1", "in_progress"), issue("p1", "done"), issue("p1", "cancelled"), issue(null, "todo")],
    );
    expect(chips).toHaveLength(1);
    expect(chips[0].openCount).toBe(2);
  });

  it("keeps most recently updated projects with open work, reports overflow, skips archived and idle", () => {
    const projects: Project[] = [
      project("old", "2026-01-01"),
      project("new", "2026-07-01"),
      project("mid", "2026-04-01"),
      project("idle", "2026-06-15"),
      { ...project("gone", "2026-07-02"), archivedAt: new Date("2026-07-02") } as Project,
    ];
    const issues = [issue("old", "todo"), issue("new", "todo"), issue("mid", "in_progress"), issue("gone", "todo")];
    const { chips, overflow } = selectProjectChips(projects, issues as never[], 2);
    expect(chips.map((chip) => (chip.project as { id: string }).id)).toEqual(["new", "mid"]);
    expect(overflow).toBe(1);
  });
});

describe("formatCents", () => {
  it("formats cents as dollars", () => {
    expect(formatCents(12_345)).toBe("$123.45");
    expect(formatCents(500_00)).toBe("$500");
    expect(formatCents(0)).toBe("$0");
  });
});

describe("issueStatusLabel", () => {
  it("title-cases snake_case statuses", () => {
    expect(issueStatusLabel("in_progress")).toBe("In Progress");
    expect(issueStatusLabel("todo")).toBe("Todo");
  });
});

describe("deriveCeoHeartbeat", () => {
  const NOW = new Date("2026-07-28T12:00:00Z").getTime();
  const ceo = (overrides: Record<string, unknown>) =>
    ({
      id: "agent-ceo",
      role: "ceo",
      status: "active",
      lastHeartbeatAt: new Date("2026-07-28T11:50:00Z"),
      runtimeConfig: { heartbeat: { enabled: true, intervalSec: 1800 } },
      ...overrides,
    }) as never;

  it("is ok when the last beat is within 1.5x the interval", () => {
    expect(deriveCeoHeartbeat(ceo({}), NOW).state).toBe("ok");
  });

  it("is overdue when the last beat is older than 1.5x the interval", () => {
    const stale = ceo({ lastHeartbeatAt: new Date("2026-07-28T10:00:00Z") });
    expect(deriveCeoHeartbeat(stale, NOW).state).toBe("overdue");
  });

  it("is off when heartbeat is disabled, agent paused, missing config, or never beat", () => {
    expect(deriveCeoHeartbeat(ceo({ runtimeConfig: { heartbeat: { enabled: false, intervalSec: 1800 } } }), NOW).state).toBe("off");
    expect(deriveCeoHeartbeat(ceo({ status: "paused" }), NOW).state).toBe("off");
    expect(deriveCeoHeartbeat(ceo({ runtimeConfig: {} }), NOW).state).toBe("off");
    expect(deriveCeoHeartbeat(ceo({ lastHeartbeatAt: null }), NOW).state).toBe("off");
    expect(deriveCeoHeartbeat(undefined, NOW).state).toBe("off");
  });
});

describe("selectCeo", () => {
  it("returns the first agent with role ceo, or undefined", () => {
    const agents = [
      { id: "a1", role: "engineer" },
      { id: "a2", role: "ceo" },
      { id: "a3", role: "ceo" },
    ] as never[];
    expect((selectCeo(agents) as { id: string } | undefined)?.id).toBe("a2");
    expect(selectCeo([{ id: "a1", role: "engineer" }] as never[])).toBeUndefined();
  });
});

describe("layout modes", () => {
  it("normalizes stored values, defaulting to auto", () => {
    expect(normalizeLayoutMode("2")).toBe("2");
    expect(normalizeLayoutMode("banana")).toBe("auto");
    expect(normalizeLayoutMode(null)).toBe("auto");
  });

  it("treats fixed column counts as responsive caps, not forces", () => {
    // A persisted "3" on a narrow window must fall back to fewer columns.
    expect(PLICA_LAYOUT_CLASSES["3"]).not.toContain(" grid-cols-3");
    expect(PLICA_LAYOUT_CLASSES["3"]).toContain("xl:grid-cols-3");
    expect(PLICA_LAYOUT_CLASSES["2"]).toContain("sm:grid-cols-2");
  });
});

describe("healthLabel", () => {
  it("names the reason, not just the color", () => {
    const summary = {
      agents: { error: 2 },
      budgets: { activeIncidents: 1 },
      pendingApprovals: 3,
    } as never;
    expect(healthLabel("red", summary)).toBe("Health: red — 1 incident, 2 agent errors");
    expect(healthLabel("amber", summary)).toBe("Health: amber — 3 approvals pending");
    expect(healthLabel("green", summary)).toBe("Health: green — all clear");
    expect(healthLabel("red", undefined)).toBe("Health: red — unreachable");
  });
});

describe("view modes", () => {
  it("normalizes stored values, defaulting to wall", () => {
    expect(normalizeViewMode("triage")).toBe("triage");
    expect(normalizeViewMode("wall")).toBe("wall");
    expect(normalizeViewMode("banana")).toBe("wall");
    expect(normalizeViewMode(null)).toBe("wall");
    expect(normalizeViewMode(undefined)).toBe("wall");
  });
});

describe("deriveActionable", () => {
  const attention = (items: Array<{ severity: string; dismissed?: boolean }>): AttentionFeed =>
    ({
      companyId: "c1",
      generatedAt: "",
      totalCount: items.length,
      countsBySourceKind: {},
      items: items.map((item, index) => ({
        id: `att-${index}`,
        companyId: "c1",
        sourceKind: "blocker_attention",
        severity: item.severity,
        rank: index,
        whyNow: "",
        dismissal: item.dismissed ? { dismissedAt: "2026-07-28T00:00:00Z" } : null,
        subject: { kind: "issue", id: `i${index}`, companyId: "c1", title: null, identifier: null, status: null, href: null },
      })),
    }) as never;

  it("counts approvals, undismissed attention items, and an overdue CEO", () => {
    const approvals = [{ id: "a1" }, { id: "a2" }] as Approval[];
    const result = deriveActionable({
      approvals,
      attention: attention([{ severity: "low" }, { severity: "medium", dismissed: true }]),
      ceoOverdue: true,
    });
    // 2 approvals + 1 undismissed attention item + 1 for the overdue CEO
    expect(result.count).toBe(4);
    expect(result.criticalOrHigh).toBe(false);
  });

  it("flags criticalOrHigh when any undismissed attention item is critical or high", () => {
    expect(
      deriveActionable({ approvals: [], attention: attention([{ severity: "critical" }]), ceoOverdue: false })
        .criticalOrHigh,
    ).toBe(true);
    expect(
      deriveActionable({ approvals: [], attention: attention([{ severity: "high" }]), ceoOverdue: false })
        .criticalOrHigh,
    ).toBe(true);
    expect(
      deriveActionable({
        approvals: [],
        attention: attention([{ severity: "critical", dismissed: true }]),
        ceoOverdue: false,
      }).criticalOrHigh,
    ).toBe(false);
  });

  it("is zero/false with no data", () => {
    expect(deriveActionable({ approvals: [], attention: undefined, ceoOverdue: false })).toEqual({
      criticalOrHigh: false,
      count: 0,
    });
  });
});

describe("orderTriageCompanies", () => {
  const company = (id: string, name: string) => ({ id, name, issuePrefix: id.toUpperCase() }) as Company;

  it("puts critical/high companies first, then orders by actionable count desc, then name asc", () => {
    const entries = [
      { company: company("b", "Beta"), actionable: { criticalOrHigh: false, count: 3 } },
      { company: company("a", "Alpha"), actionable: { criticalOrHigh: true, count: 1 } },
      { company: company("c", "Charlie"), actionable: { criticalOrHigh: false, count: 3 } },
      { company: company("d", "Delta"), actionable: { criticalOrHigh: false, count: 0 } },
    ];
    const ordered = orderTriageCompanies(entries).map((entry) => entry.company.name);
    expect(ordered).toEqual(["Alpha", "Beta", "Charlie", "Delta"]);
  });

  it("does not mutate the input array", () => {
    const entries = [
      { company: company("b", "Beta"), actionable: { criticalOrHigh: false, count: 1 } },
      { company: company("a", "Alpha"), actionable: { criticalOrHigh: false, count: 2 } },
    ];
    const originalOrder = entries.map((entry) => entry.company.id);
    orderTriageCompanies(entries);
    expect(entries.map((entry) => entry.company.id)).toEqual(originalOrder);
  });
});

describe("labels", () => {
  const NOW = new Date("2026-07-28T12:00:00Z").getTime();
  it("renders relative time and interval labels", () => {
    expect(relativeTimeLabel("2026-07-28T11:48:00Z", NOW)).toBe("12m ago");
    expect(relativeTimeLabel("2026-07-28T09:00:00Z", NOW)).toBe("3h ago");
    expect(intervalLabel(1800)).toBe("every 30m");
    expect(intervalLabel(7200)).toBe("every 2h");
    expect(intervalLabel(null)).toBeNull();
  });
});

describe("summarizePayloadEntries", () => {
  it("renders flat primitive entries as key/value pairs", () => {
    expect(summarizePayloadEntries({ reason: "Need more tokens", amount: 500, ok: true })).toEqual([
      { key: "reason", value: "Need more tokens" },
      { key: "amount", value: "500" },
      { key: "ok", value: "true" },
    ]);
  });

  it("JSON.stringifies nested objects and arrays", () => {
    expect(summarizePayloadEntries({ meta: { a: 1 }, tags: ["x", "y"] })).toEqual([
      { key: "meta", value: JSON.stringify({ a: 1 }) },
      { key: "tags", value: JSON.stringify(["x", "y"]) },
    ]);
  });

  it("truncates values longer than maxLen (default 120)", () => {
    const long = "a".repeat(200);
    const [entry] = summarizePayloadEntries({ note: long });
    expect(entry.value).toBe(long.slice(0, 120));
    expect(entry.value.length).toBe(120);
  });

  it("respects a custom maxLen", () => {
    const [entry] = summarizePayloadEntries({ note: "abcdefghij" }, 5);
    expect(entry.value).toBe("abcde");
  });

  it("renders null/undefined values as their string form", () => {
    expect(summarizePayloadEntries({ a: null, b: undefined })).toEqual([
      { key: "a", value: "null" },
      { key: "b", value: "undefined" },
    ]);
  });
});

describe("nudgeTitle", () => {
  it("uses the first line, trimmed", () => {
    expect(nudgeTitle("  Ping the CEO  \nmore detail below")).toBe("Ping the CEO");
  });

  it("truncates the first line to 140 chars", () => {
    const long = "x".repeat(200);
    const title = nudgeTitle(long);
    expect(title.length).toBe(140);
    expect(title).toBe(long.slice(0, 140));
  });

  it("returns an empty string for empty input", () => {
    expect(nudgeTitle("")).toBe("");
  });

  it("skips a leading blank line so a draft that starts with a newline still yields a title", () => {
    expect(nudgeTitle("\nActual title\nmore detail")).toBe("Actual title");
    expect(nudgeTitle("\n\n  Ping the CEO  ")).toBe("Ping the CEO");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(nudgeTitle("   \n  \n  ")).toBe("");
  });
});

describe("sparklineDays", () => {
  const day = (date: string, succeeded: number, failed: number): DashboardRunActivityDay =>
    ({ date, succeeded, failed, recovered: 0, other: 0, total: succeeded + failed }) as DashboardRunActivityDay;

  it("keeps only the trailing `count` days", () => {
    const runActivity = Array.from({ length: 10 }, (_, i) => day(`2026-07-${10 + i}`, 1, 0));
    expect(sparklineDays(runActivity, 7)).toHaveLength(7);
    expect(sparklineDays(runActivity, 7)[0].date).toBe("2026-07-13");
  });

  it("scales bar heights to the busiest day in the window", () => {
    const runActivity = [day("2026-07-27", 5, 5), day("2026-07-28", 10, 0)];
    const [d1, d2] = sparklineDays(runActivity, 7);
    expect(d2.succeededHeightPct).toBe(100);
    expect(d1.succeededHeightPct).toBe(50);
    expect(d1.failedHeightPct).toBe(50);
  });

  it("marks a zero-activity day as no activity with zero heights", () => {
    const [d] = sparklineDays([day("2026-07-28", 0, 0)], 7);
    expect(d.hasActivity).toBe(false);
    expect(d.succeededHeightPct).toBe(0);
    expect(d.failedHeightPct).toBe(0);
  });

  it("builds the tooltip title text", () => {
    const [d] = sparklineDays([day("2026-07-28", 12, 1)], 7);
    expect(d.title).toBe(`${d.label}: 12 ok, 1 failed`);
    expect(d.title).toContain("12 ok, 1 failed");
  });
});

describe("detectAlertEdges", () => {
  const snap = (overrides: Partial<PlicaAlertSnapshot> = {}): PlicaAlertSnapshot => ({
    health: "green",
    criticalAttentionIds: [],
    ceoOverdue: false,
    ...overrides,
  });

  it("returns no events on the first (baseline) snapshot", () => {
    expect(detectAlertEdges(null, snap({ health: "red", ceoOverdue: true, criticalAttentionIds: ["a"] }))).toEqual(
      [],
    );
  });

  it("fires health_red only on the green/amber -> red transition", () => {
    expect(detectAlertEdges(snap({ health: "amber" }), snap({ health: "red" }))).toEqual([{ kind: "health_red" }]);
    // already red -> red is not a new transition
    expect(detectAlertEdges(snap({ health: "red" }), snap({ health: "red" }))).toEqual([]);
  });

  it("fires critical_attention only for newly appeared ids", () => {
    const prev = snap({ criticalAttentionIds: ["a"] });
    const next = snap({ criticalAttentionIds: ["a", "b", "c"] });
    expect(detectAlertEdges(prev, next)).toEqual([
      { kind: "critical_attention", detail: "b" },
      { kind: "critical_attention", detail: "c" },
    ]);
  });

  it("does not fire critical_attention for ids that disappear or stay", () => {
    const prev = snap({ criticalAttentionIds: ["a", "b"] });
    const next = snap({ criticalAttentionIds: ["a"] });
    expect(detectAlertEdges(prev, next)).toEqual([]);
  });

  it("fires ceo_overdue only on the transition to overdue", () => {
    expect(detectAlertEdges(snap({ ceoOverdue: false }), snap({ ceoOverdue: true }))).toEqual([
      { kind: "ceo_overdue" },
    ]);
    expect(detectAlertEdges(snap({ ceoOverdue: true }), snap({ ceoOverdue: true }))).toEqual([]);
  });

  it("can fire multiple edges in one comparison", () => {
    const prev = snap({ health: "green", criticalAttentionIds: [], ceoOverdue: false });
    const next = snap({ health: "red", criticalAttentionIds: ["x"], ceoOverdue: true });
    expect(detectAlertEdges(prev, next)).toEqual([
      { kind: "health_red" },
      { kind: "critical_attention", detail: "x" },
      { kind: "ceo_overdue" },
    ]);
  });
});

describe("shouldShowBriefing", () => {
  const now = new Date("2026-07-29T12:00:00.000Z").getTime();

  it("is false when there is no recorded last visit", () => {
    expect(shouldShowBriefing(null, now)).toBe(false);
  });

  it("is false when the last visit was under 30 minutes ago", () => {
    expect(shouldShowBriefing(new Date(now - 10 * 60_000).toISOString(), now)).toBe(false);
    expect(shouldShowBriefing(new Date(now - 29 * 60_000).toISOString(), now)).toBe(false);
  });

  it("is true when the last visit was more than 30 minutes ago", () => {
    expect(shouldShowBriefing(new Date(now - 31 * 60_000).toISOString(), now)).toBe(true);
    expect(shouldShowBriefing(new Date(now - 2 * 60 * 60_000).toISOString(), now)).toBe(true);
  });
});

describe("deriveBriefingLine", () => {
  const sinceIso = "2026-07-29T10:00:00.000Z";
  const before = "2026-07-29T09:00:00.000Z"; // before `since` — should not count
  const after = "2026-07-29T11:00:00.000Z"; // after `since` — should count

  it("returns all zeros for empty input", () => {
    expect(deriveBriefingLine({ sinceIso })).toEqual({ done: 0, blockers: 0, failedRuns: 0 });
    expect(deriveBriefingLine({ issues: [], timelineEntries: { spans: [] }, sinceIso })).toEqual({
      done: 0,
      blockers: 0,
      failedRuns: 0,
    });
  });

  it("counts failed and timed-out spans as failed runs, regardless of sinceIso", () => {
    const timelineEntries = {
      spans: [
        { status: "succeeded" },
        { status: "failed" },
        { status: "timed_out" },
        { status: "running" },
        { status: "cancelled" },
      ],
    };
    expect(deriveBriefingLine({ timelineEntries, sinceIso }).failedRuns).toBe(2);
  });

  it("counts issues currently done/blocked whose updatedAt is after sinceIso", () => {
    const issues = [
      { status: "done", updatedAt: after },
      { status: "done", updatedAt: after },
      { status: "blocked", updatedAt: after },
      { status: "done", updatedAt: before }, // stale — updated before the visit, doesn't count
      { status: "in_progress", updatedAt: after }, // wrong status — doesn't count
    ];
    expect(deriveBriefingLine({ issues, sinceIso })).toEqual({ done: 2, blockers: 1, failedRuns: 0 });
  });

  it("accepts updatedAt as either a Date or an ISO string", () => {
    const issues = [
      { status: "done", updatedAt: new Date(after) },
      { status: "blocked", updatedAt: after },
    ];
    expect(deriveBriefingLine({ issues, sinceIso })).toEqual({ done: 1, blockers: 1, failedRuns: 0 });
  });

  it("ignores issues with no updatedAt", () => {
    expect(deriveBriefingLine({ issues: [{ status: "done", updatedAt: undefined }], sinceIso })).toEqual({
      done: 0,
      blockers: 0,
      failedRuns: 0,
    });
  });

  it("treats an issue updated exactly at sinceIso as not-yet-changed (strictly after only)", () => {
    expect(deriveBriefingLine({ issues: [{ status: "done", updatedAt: sinceIso }], sinceIso })).toEqual({
      done: 0,
      blockers: 0,
      failedRuns: 0,
    });
  });

  it("combines issues and timeline spans in one summary", () => {
    const issues = [
      { status: "done", updatedAt: after },
      { status: "blocked", updatedAt: after },
    ];
    const timelineEntries = { spans: [{ status: "failed" }, { status: "failed" }] };
    expect(deriveBriefingLine({ issues, timelineEntries, sinceIso })).toEqual({ done: 1, blockers: 1, failedRuns: 2 });
  });
});

describe("pane ordering", () => {
  it("normalizes sort mode", () => {
    expect(normalizeSortMode("hot")).toBe("hot");
    expect(normalizeSortMode("junk")).toBe("manual");
    expect(normalizeSortMode(null)).toBe("manual");
  });

  it("partitions hot companies first, keeping relative order stable", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(partitionHotFirst(items, new Set(["c", "a"])).map((x) => x.id)).toEqual(["a", "c", "b", "d"]);
    expect(partitionHotFirst(items, new Set()).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("deriveTriageSummary", () => {
  const feed = (items: Array<{ sourceKind: string; dismissed?: boolean }>) =>
    ({
      items: items.map((item, index) => ({
        id: `att-${index}`,
        sourceKind: item.sourceKind,
        dismissal: item.dismissed ? { dismissedAt: "x" } : null,
      })),
    }) as never;

  it("summarizes blockers, approvals, failures, ceo, and other attention", () => {
    const parts = deriveTriageSummary({
      approvalCount: 1,
      attention: feed([
        { sourceKind: "blocker_attention" },
        { sourceKind: "blocker_attention" },
        { sourceKind: "failed_run" },
        { sourceKind: "review" },
        { sourceKind: "budget_alert", dismissed: true },
      ]),
      ceoOverdue: true,
    });
    expect(parts).toEqual([
      { label: "2 blockers", tone: "critical" },
      { label: "1 approval", tone: "warn" },
      { label: "1 failed run", tone: "warn" },
      { label: "CEO overdue", tone: "warn" },
      { label: "1 attention item", tone: "muted" },
    ]);
  });

  it("returns empty for a clear company", () => {
    expect(deriveTriageSummary({ approvalCount: 0, attention: feed([]), ceoOverdue: false })).toEqual([]);
  });
});

describe("attentionDetailText", () => {
  it("renders questions, confirmations, blockers, and budget details", () => {
    expect(attentionDetailText({ kind: "questions", questionCount: 3, firstQuestionText: "Which region?", images: [] } as never))
      .toBe("3 questions — “Which region?”");
    expect(attentionDetailText({ kind: "confirmation", promptExcerpt: "Delete staging DB?", isPlanTarget: false, images: [] } as never))
      .toBe("Delete staging DB?");
    expect(attentionDetailText({ kind: "blocker", blockingIssue: { id: "x", identifier: "AGE-9", title: "Key rotation" }, images: [] } as never))
      .toBe("blocked by AGE-9 — Key rotation");
    expect(attentionDetailText({ kind: "budget", observedPercent: 92, amountObserved: 4600, amountLimit: 5000, images: [] } as never))
      .toBe("92% of budget used ($46.00 of $50.00)");
    expect(attentionDetailText(null)).toBeNull();
  });
});

describe("normalizeCollapsedIds", () => {
  it("parses valid lists and tolerates junk", () => {
    expect(normalizeCollapsedIds(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    expect(normalizeCollapsedIds("not json")).toEqual([]);
    expect(normalizeCollapsedIds(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(normalizeCollapsedIds(null)).toEqual([]);
  });
});

describe("normalizePinnedIds", () => {
  it("round-trips a stored list", () => {
    expect(normalizePinnedIds(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("returns empty for junk, non-arrays, and absent values", () => {
    expect(normalizePinnedIds(null)).toEqual([]);
    expect(normalizePinnedIds("")).toEqual([]);
    expect(normalizePinnedIds("{oops")).toEqual([]);
    expect(normalizePinnedIds(JSON.stringify({ a: 1 }))).toEqual([]);
  });

  it("drops non-string entries rather than trusting the blob", () => {
    expect(normalizePinnedIds(JSON.stringify(["a", 3, null, "b"]))).toEqual(["a", "b"]);
  });
});

describe("normalizeBarMode", () => {
  it("defaults to signal for anything unrecognized", () => {
    expect(normalizeBarMode(null)).toBe("signal");
    expect(normalizeBarMode("nonsense")).toBe("signal");
    expect(normalizeBarMode("signal")).toBe("signal");
  });

  it("accepts matrix", () => {
    expect(normalizeBarMode("matrix")).toBe("matrix");
  });
});

describe("worstSeverity", () => {
  it("returns null for an empty set", () => {
    expect(worstSeverity([])).toBeNull();
  });

  it("ranks critical above high above medium above low", () => {
    expect(worstSeverity([{ severity: "low" }, { severity: "high" }, { severity: "medium" }])).toBe("high");
    expect(worstSeverity([{ severity: "high" }, { severity: "critical" }])).toBe("critical");
    expect(worstSeverity([{ severity: "low" }, { severity: "medium" }])).toBe("medium");
  });
});

describe("attentionKindSummary", () => {
  const feed = (items: Array<{ kind: string; severity: string; dismissed?: boolean }>): AttentionFeed =>
    ({
      companyId: "c1",
      generatedAt: "",
      totalCount: items.length,
      countsBySourceKind: {},
      items: items.map((item, index) => ({
        id: `att-${index}`,
        companyId: "c1",
        sourceKind: item.kind,
        severity: item.severity,
        rank: index,
        whyNow: "",
        dismissal: item.dismissed ? { dismissedAt: "2026-07-28T00:00:00Z" } : null,
        subject: { kind: "issue", id: `i${index}`, companyId: "c1", title: null, identifier: null, status: null, href: null },
      })),
    }) as never;

  it("returns a cell per known kind even when the feed is missing", () => {
    const summary = attentionKindSummary(undefined);
    expect(summary.total).toBe(0);
    expect(summary.cells).toHaveLength(PLICA_ATTENTION_KINDS.length);
    expect(summary.cells.every((cell) => cell.count === 0 && cell.worst === null)).toBe(true);
  });

  it("counts per kind and reports each cell's worst severity", () => {
    const summary = attentionKindSummary(
      feed([
        { kind: "failed_run", severity: "high" },
        { kind: "failed_run", severity: "critical" },
        { kind: "approval", severity: "medium" },
      ]),
    );
    const failed = summary.cells.find((cell) => cell.kind === "failed_run");
    const approval = summary.cells.find((cell) => cell.kind === "approval");
    expect(failed).toMatchObject({ count: 2, worst: "critical" });
    expect(approval).toMatchObject({ count: 1, worst: "medium" });
    expect(summary.total).toBe(3);
  });

  it("excludes dismissed items, matching what the panes below show", () => {
    const summary = attentionKindSummary(
      feed([
        { kind: "approval", severity: "critical", dismissed: true },
        { kind: "approval", severity: "low" },
      ]),
    );
    expect(summary.cells.find((cell) => cell.kind === "approval")).toMatchObject({ count: 1, worst: "low" });
    expect(summary.total).toBe(1);
  });

  it("counts an unknown kind toward the total without inventing a cell", () => {
    const summary = attentionKindSummary(feed([{ kind: "something_new", severity: "high" }]));
    expect(summary.total).toBe(1);
    expect(summary.cells.every((cell) => cell.count === 0)).toBe(true);
  });
});

describe("sumAgentTokens", () => {
  it("returns 0 for missing or empty rows", () => {
    expect(sumAgentTokens(undefined)).toBe(0);
    expect(sumAgentTokens([])).toBe(0);
  });

  it("counts api and subscription columns together", () => {
    const rows = [
      {
        inputTokens: 10, cachedInputTokens: 5, outputTokens: 2,
        subscriptionInputTokens: 100, subscriptionCachedInputTokens: 50, subscriptionOutputTokens: 20,
      },
      { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    ] as never;
    // 17 api + 170 subscription + 2 = 189
    expect(sumAgentTokens(rows)).toBe(189);
  });
});

describe("formatTokens", () => {
  it("scales to B/M/K and drops the decimal above 100M", () => {
    expect(formatTokens(1_190_000_000)).toBe("1.19B");
    expect(formatTokens(574_200_000)).toBe("574M");
    expect(formatTokens(99_300_000)).toBe("99.3M");
    expect(formatTokens(250_000)).toBe("250K");
    expect(formatTokens(42)).toBe("42");
  });

  it("treats absent or nonsense counts as zero rather than NaN", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(Number.NaN)).toBe("0");
  });
});

describe("tokenState", () => {
  const th = { warn: 250e6, crit: 500e6 };
  it("is exclusive at both bounds, so a threshold is a ceiling not a trigger", () => {
    expect(tokenState(250e6, th)).toBe("ok");
    expect(tokenState(250e6 + 1, th)).toBe("warn");
    expect(tokenState(500e6, th)).toBe("warn");
    expect(tokenState(500e6 + 1, th)).toBe("crit");
  });
});

describe("normalizeTokenSettings", () => {
  it("falls back to defaults for junk and absent values", () => {
    expect(normalizeTokenSettings(null)).toEqual({ defaults: PLICA_TOKEN_DEFAULTS, overrides: {} });
    expect(normalizeTokenSettings("{oops")).toEqual({ defaults: PLICA_TOKEN_DEFAULTS, overrides: {} });
  });

  it("round-trips defaults and overrides", () => {
    const raw = JSON.stringify({ defaults: { warn: 1, crit: 2 }, overrides: { c1: { warn: 3, crit: 4 } } });
    expect(normalizeTokenSettings(raw)).toEqual({ defaults: { warn: 1, crit: 2 }, overrides: { c1: { warn: 3, crit: 4 } } });
  });

  it("rejects thresholds that are not a usable pair", () => {
    // crit must sit above warn, and neither may be zero or negative
    const bad = JSON.stringify({
      defaults: { warn: 500, crit: 100 },
      overrides: { c1: { warn: 0, crit: 5 }, c2: { warn: "x", crit: 5 }, c3: { warn: 1, crit: 2 } },
    });
    const settings = normalizeTokenSettings(bad);
    expect(settings.defaults).toEqual(PLICA_TOKEN_DEFAULTS);
    expect(settings.overrides).toEqual({ c3: { warn: 1, crit: 2 } });
  });
});

describe("thresholdsFor", () => {
  it("inherits the default when a company has no override", () => {
    const settings = { defaults: { warn: 1, crit: 2 }, overrides: { other: { warn: 9, crit: 10 } } };
    expect(thresholdsFor(settings, "c1")).toEqual({ warn: 1, crit: 2 });
    expect(thresholdsFor(settings, "other")).toEqual({ warn: 9, crit: 10 });
  });
});

describe("aggregateTokenState", () => {
  const settings = { defaults: { warn: 100, crit: 200 }, overrides: {} };

  it("judges the group against the sum of its members' own thresholds", () => {
    // two members => warn 200, crit 400
    expect(aggregateTokenState(settings, [{ id: "a", tokens: 90 }, { id: "b", tokens: 90 }]).state).toBe("ok");
    expect(aggregateTokenState(settings, [{ id: "a", tokens: 150 }, { id: "b", tokens: 90 }]).state).toBe("warn");
    expect(aggregateTokenState(settings, [{ id: "a", tokens: 300 }, { id: "b", tokens: 150 }]).state).toBe("crit");
  });

  it("respects overrides when summing the group's allowance", () => {
    const withOverride = { defaults: { warn: 100, crit: 200 }, overrides: { b: { warn: 900, crit: 1000 } } };
    // warn allowance is 100 + 900 = 1000, so 500 total stays ok
    expect(aggregateTokenState(withOverride, [{ id: "a", tokens: 250 }, { id: "b", tokens: 250 }]).state).toBe("ok");
  });

  it("reports whether any member actually knew its token count", () => {
    expect(aggregateTokenState(settings, [{ id: "a", tokens: undefined }]).known).toBe(false);
    expect(aggregateTokenState(settings, [{ id: "a", tokens: 1 }]).known).toBe(true);
  });
});

describe("currentMonthRange", () => {
  it("runs from the first of the month to today", () => {
    expect(currentMonthRange(Date.UTC(2026, 7, 14, 9, 30))).toEqual({ from: "2026-08-01", to: "2026-08-14" });
  });
});

describe("deriveCompanyStats", () => {
  const now = Date.UTC(2026, 7, 14, 12, 0);
  const base = {
    summary: {
      agents: { active: 9, running: 6, paused: 0, error: 0 },
      tasks: { open: 1, inProgress: 23, blocked: 0, done: 0 },
    },
    badges: { inbox: 4 },
    tokens: 500,
    unavailable: false,
    nowMs: now,
  } as never;

  const feed = (items: Array<{ kind: string; severity: string; minsAgo?: number; dismissed?: boolean }>) =>
    ({
      items: items.map((item, index) => ({
        id: `a${index}`,
        sourceKind: item.kind,
        severity: item.severity,
        dismissal: item.dismissed ? { dismissedAt: "x" } : null,
        activityAt: item.minsAgo === undefined ? null : new Date(now - item.minsAgo * 60_000).toISOString(),
      })),
    }) as never;

  it("summarises agents, tasks, attention, criticals, failures and the oldest wait", () => {
    const stats = deriveCompanyStats({
      ...(base as object),
      attention: feed([
        { kind: "failed_run", severity: "critical", minsAgo: 41 },
        { kind: "failed_run", severity: "high", minsAgo: 12 },
        { kind: "approval", severity: "medium", minsAgo: 900 },
        { kind: "approval", severity: "critical", dismissed: true, minsAgo: 5 },
      ]),
    } as never);
    expect(stats).toMatchObject({
      running: 6, active: 9, tasks: 23,
      needs: 3, critical: 1, failed: 2,
      oldestMins: 900, inbox: 4, tokens: 500,
    });
  });

  it("reports no oldest wait when nothing is waiting", () => {
    expect(deriveCompanyStats({ ...(base as object), attention: feed([]) } as never).oldestMins).toBeNull();
  });

  it("ignores items with no timestamp rather than treating them as ancient", () => {
    const stats = deriveCompanyStats({
      ...(base as object),
      attention: feed([{ kind: "approval", severity: "low" }, { kind: "approval", severity: "low", minsAgo: 30 }]),
    } as never);
    expect(stats.needs).toBe(2);
    expect(stats.oldestMins).toBe(30);
  });
});

describe("formatAgeMinutes", () => {
  it("renders an em dash for nothing waiting, then m/h/d", () => {
    expect(formatAgeMinutes(null)).toBe("—");
    expect(formatAgeMinutes(18)).toBe("18m");
    expect(formatAgeMinutes(240)).toBe("4h");
    expect(formatAgeMinutes(2880)).toBe("2d");
  });
});

describe("normalizeRowMode", () => {
  it("defaults to ledger, the mode that fixes the ragged rows", () => {
    expect(normalizeRowMode(null)).toBe("ledger");
    expect(normalizeRowMode("nonsense")).toBe("ledger");
  });

  it("accepts each known mode", () => {
    expect(normalizeRowMode("card")).toBe("card");
    expect(normalizeRowMode("digest")).toBe("digest");
    expect(normalizeRowMode("ledger")).toBe("ledger");
  });
});

describe("compareAttention", () => {
  const item = (severity: string, minsAgo: number) =>
    ({ severity, activityAt: new Date(Date.UTC(2026, 7, 14, 12) - minsAgo * 60_000).toISOString() }) as never;

  it("puts worse severities first", () => {
    const sorted = [item("medium", 1), item("critical", 999), item("high", 1)].sort(compareAttention);
    expect(sorted.map((i: { severity: string }) => i.severity)).toEqual(["critical", "high", "medium"]);
  });

  it("puts the oldest first within a severity", () => {
    const sorted = [item("high", 10), item("high", 500), item("high", 100)].sort(compareAttention);
    expect(sorted.map((i: { activityAt: string }) => i.activityAt)).toEqual([
      new Date(Date.UTC(2026, 7, 14, 12) - 500 * 60_000).toISOString(),
      new Date(Date.UTC(2026, 7, 14, 12) - 100 * 60_000).toISOString(),
      new Date(Date.UTC(2026, 7, 14, 12) - 10 * 60_000).toISOString(),
    ]);
  });
});

describe("groupAttentionByKind", () => {
  const item = (id: string, kind: string, severity = "medium") =>
    ({ id, sourceKind: kind, severity, activityAt: null }) as never;

  it("groups in the bar's kind order so a company reads the same everywhere", () => {
    const groups = groupAttentionByKind([
      item("a", "approval"),
      item("b", "failed_run"),
      item("c", "blocker_attention"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["blocker_attention", "failed_run", "approval"]);
  });

  it("reports each group's worst severity and drops empty kinds", () => {
    const groups = groupAttentionByKind([item("a", "approval", "high"), item("b", "approval", "low")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "approval", worst: "high" });
    expect(groups[0].items).toHaveLength(2);
  });

  it("keeps an unknown kind under its own name rather than dropping it", () => {
    const groups = groupAttentionByKind([item("a", "something_new")]);
    expect(groups.map((g) => ({ kind: g.kind, label: g.label }))).toEqual([
      { kind: "something_new", label: "something new" },
    ]);
  });
});

describe("attentionAgeMinutes", () => {
  const now = Date.UTC(2026, 7, 14, 12);
  it("returns null when an item carries no timestamp", () => {
    expect(attentionAgeMinutes({ activityAt: null }, now)).toBeNull();
  });
  it("returns whole minutes since the item last moved", () => {
    expect(attentionAgeMinutes({ activityAt: new Date(now - 90 * 60_000).toISOString() }, now)).toBe(90);
  });
  it("rejects a future timestamp rather than reporting a negative age", () => {
    expect(attentionAgeMinutes({ activityAt: new Date(now + 60_000).toISOString() }, now)).toBeNull();
  });
});

describe("mergeAttentionFeed", () => {
  const at = (mins: number) => new Date(Date.UTC(2026, 7, 14, 12) - mins * 60_000).toISOString();
  const item = (id: string, minsAgo: number | null, dismissed = false) =>
    ({ id, severity: "medium", activityAt: minsAgo === null ? null : at(minsAgo), dismissal: dismissed ? {} : null }) as never;

  it("interleaves companies newest first", () => {
    const merged = mergeAttentionFeed([
      { company: { id: "a" }, items: [item("a1", 100), item("a2", 5)] },
      { company: { id: "b" }, items: [item("b1", 50)] },
    ]);
    expect(merged.map((row) => row.item.id)).toEqual(["a2", "b1", "a1"]);
  });

  it("drops dismissed items and tolerates a company with no feed yet", () => {
    const merged = mergeAttentionFeed([
      { company: { id: "a" }, items: [item("a1", 1, true), item("a2", 2)] },
      { company: { id: "b" }, items: undefined },
    ]);
    expect(merged.map((row) => row.item.id)).toEqual(["a2"]);
  });

  it("sorts timestamp-less items last rather than letting them lead the stream", () => {
    const merged = mergeAttentionFeed([
      { company: { id: "a" }, items: [item("none", null), item("recent", 1)] },
    ]);
    expect(merged.map((row) => row.item.id)).toEqual(["recent", "none"]);
  });
});

describe("filterFeed", () => {
  const now = Date.UTC(2026, 7, 14, 12);
  const at = (mins: number) => new Date(now - mins * 60_000).toISOString();
  const rows = [
    { company: { id: "a" }, item: { severity: "critical", activityAt: at(5) } },
    { company: { id: "a" }, item: { severity: "medium", activityAt: at(500) } },
    { company: { id: "b" }, item: { severity: "high", activityAt: at(600) } },
  ] as never;

  it("keeps everything by default", () => {
    expect(filterFeed(rows, "all", now - 60 * 60_000)).toHaveLength(3);
  });

  it("urgent keeps critical and high only", () => {
    expect(filterFeed(rows, "urgent", null).map((r: { item: { severity: string } }) => r.item.severity)).toEqual([
      "critical",
      "high",
    ]);
  });

  it("unseen keeps only what moved since the last visit", () => {
    expect(filterFeed(rows, "unseen", now - 60 * 60_000)).toHaveLength(1);
  });

  it("unseen falls back to everything when there is no last visit to compare against", () => {
    expect(filterFeed(rows, "unseen", null)).toHaveLength(3);
  });
});

describe("bucketAttentionByAge", () => {
  const now = Date.UTC(2026, 7, 14, 12);
  const at = (mins: number) => ({ activityAt: new Date(now - mins * 60_000).toISOString() });

  it("splits items across the four buckets by age", () => {
    const buckets = bucketAttentionByAge([at(10), at(90), at(300), at(2000), at(2500)], now);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 2]);
    expect(buckets.map((b) => b.label)).toEqual(["<1h", "1–4h", "4–12h", ">12h"]);
  });

  it("flags the oldest bucket only when something is actually in it", () => {
    expect(bucketAttentionByAge([at(10)], now).some((b) => b.stale)).toBe(false);
    expect(bucketAttentionByAge([at(5000)], now).some((b) => b.stale)).toBe(true);
  });

  it("ignores timestamp-less items rather than inventing or hiding neglect", () => {
    const buckets = bucketAttentionByAge([{ activityAt: null }, at(30)], now);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(1);
  });
});

describe("selectFeedCompanies", () => {
  const companies = [{ id: "pinned" }, { id: "wall" }, { id: "docked" }, { id: "both" }];
  const zones = { pinnedIds: ["pinned", "both"], collapsedIds: ["docked", "both"] };

  it("active leaves out what you deliberately docked", () => {
    expect(selectFeedCompanies(companies, zones, "active").map((c) => c.id)).toEqual(["pinned", "wall", "both"]);
  });

  it("pinned narrows to what you are watching", () => {
    expect(selectFeedCompanies(companies, zones, "pinned").map((c) => c.id)).toEqual(["pinned", "both"]);
  });

  it("all includes the docked ones again", () => {
    expect(selectFeedCompanies(companies, zones, "all").map((c) => c.id)).toEqual([
      "pinned",
      "wall",
      "docked",
      "both",
    ]);
  });

  it("treats pinning as the stronger statement when a company carries both marks", () => {
    // "both" is pinned and holds a stale collapsed id; pinning wins
    expect(selectFeedCompanies(companies, zones, "active").map((c) => c.id)).toContain("both");
  });
});

describe("deriveRoutineHealth", () => {
  const now = Date.UTC(2026, 7, 14, 12);
  const at = (mins: number) => new Date(now + mins * 60_000).toISOString();
  const routine = (over: Record<string, unknown> = {}) =>
    ({ id: "r", title: "Nightly report", status: "active", triggers: [], lastRun: null, ...over }) as never;

  it("counts nothing when a company has no routines", () => {
    expect(deriveRoutineHealth(undefined, now)).toMatchObject({ total: 0, active: 0, overdue: 0, nextRunAt: null });
  });

  it("separates active from paused and ignores archived entirely", () => {
    const health = deriveRoutineHealth(
      [routine(), routine({ status: "paused" }), routine({ status: "archived" })],
      now,
    );
    expect(health).toMatchObject({ total: 2, active: 1, paused: 1 });
  });

  it("reports the soonest upcoming run and which routine it belongs to", () => {
    const health = deriveRoutineHealth(
      [
        routine({ title: "Later", triggers: [{ enabled: true, nextRunAt: at(120) }] }),
        routine({ title: "Sooner", triggers: [{ enabled: true, nextRunAt: at(15) }] }),
      ],
      now,
    );
    expect(health.nextTitle).toBe("Sooner");
    expect(health.nextRunAt).toBe(at(15));
  });

  it("counts a trigger as overdue only once it is past the grace window", () => {
    const withinGrace = deriveRoutineHealth([routine({ triggers: [{ enabled: true, nextRunAt: at(-5) }] })], now);
    expect(withinGrace.overdue).toBe(0);
    // still counts as the next run, since it has not been written off yet
    expect(withinGrace.nextRunAt).toBe(at(-5));

    const past = deriveRoutineHealth([routine({ triggers: [{ enabled: true, nextRunAt: at(-45) }] })], now);
    expect(past.overdue).toBe(1);
    expect(past.nextRunAt).toBeNull();
  });

  it("ignores disabled triggers and paused routines when looking for overdue work", () => {
    const health = deriveRoutineHealth(
      [
        routine({ triggers: [{ enabled: false, nextRunAt: at(-500) }] }),
        routine({ status: "paused", triggers: [{ enabled: true, nextRunAt: at(-500) }] }),
      ],
      now,
    );
    expect(health.overdue).toBe(0);
  });

  it("counts a failed last run as failing", () => {
    const health = deriveRoutineHealth(
      [routine({ lastRun: { status: "failed" } }), routine({ lastRun: { status: "completed" } })],
      now,
    );
    expect(health.failing).toBe(1);
  });
});

describe("formatCountdown", () => {
  const now = Date.UTC(2026, 7, 14, 12);
  const at = (mins: number) => new Date(now + mins * 60_000).toISOString();

  it("renders an em dash when nothing is scheduled", () => {
    expect(formatCountdown(null, now)).toBe("—");
  });

  it("counts forward in m/h/d", () => {
    expect(formatCountdown(at(12), now)).toBe("in 12m");
    expect(formatCountdown(at(180), now)).toBe("in 3h");
    expect(formatCountdown(at(2880), now)).toBe("in 2d");
  });

  it("says now for anything already due", () => {
    expect(formatCountdown(at(0), now)).toBe("now");
    expect(formatCountdown(at(-5), now)).toBe("now");
  });
});
