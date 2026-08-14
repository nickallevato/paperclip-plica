import type {
  Agent,
  Approval,
  AttentionFeed,
  AttentionItem,
  AttentionSeverity,
  Company,
  CostByAgent,
  DashboardRunActivityDay,
  DashboardSummary,
  Issue,
  Project,
} from "@paperclipai/shared";

export type PlicaHealth = "red" | "amber" | "green";

export interface PlicaProjectChip {
  project: Project;
  openCount: number;
}

const CLOSED_ISSUE_STATUSES = new Set(["done", "cancelled"]);

export function derivePaneHealth(summary: DashboardSummary | undefined): PlicaHealth {
  if (!summary) return "green";
  if (summary.budgets.activeIncidents > 0 || summary.agents.error > 0) return "red";
  if (summary.pendingApprovals > 0) return "amber";
  return "green";
}

/** Solid dot fill per health — single source for pane, docked tile, etc. */
export const PLICA_HEALTH_DOT_CLASSES: Record<PlicaHealth, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

/**
 * Accessible/plain-language label for a pane's health dot, naming the reason
 * (incidents, agent errors, approvals) rather than just the color.
 */
export function healthLabel(health: PlicaHealth, summary: DashboardSummary | undefined): string {
  if (health === "red") {
    const reasons: string[] = [];
    const incidents = summary?.budgets.activeIncidents ?? 0;
    const errors = summary?.agents.error ?? 0;
    if (incidents > 0) reasons.push(`${incidents} incident${incidents === 1 ? "" : "s"}`);
    if (errors > 0) reasons.push(`${errors} agent error${errors === 1 ? "" : "s"}`);
    return reasons.length > 0 ? `Health: red — ${reasons.join(", ")}` : "Health: red — unreachable";
  }
  if (health === "amber") {
    const approvals = summary?.pendingApprovals ?? 0;
    return `Health: amber — ${approvals} approval${approvals === 1 ? "" : "s"} pending`;
  }
  return "Health: green — all clear";
}

export function selectProjectChips(
  projects: Project[],
  issues: Issue[],
  max = 5,
): { chips: PlicaProjectChip[]; overflow: number } {
  const openCounts = new Map<string, number>();
  for (const issue of issues) {
    if (!issue.projectId || CLOSED_ISSUE_STATUSES.has(issue.status)) continue;
    openCounts.set(issue.projectId, (openCounts.get(issue.projectId) ?? 0) + 1);
  }
  // Only projects with open work earn a pill — a wall of zero-count chips
  // tells you nothing (and archived projects never show).
  const active = projects
    .filter((project) => !project.archivedAt && (openCounts.get(project.id) ?? 0) > 0)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return {
    chips: active.slice(0, max).map((project) => ({
      project,
      openCount: openCounts.get(project.id) ?? 0,
    })),
    overflow: Math.max(0, active.length - max),
  };
}

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return cents % 100 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function issueStatusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function plicaRefetchInterval(): number {
  return typeof document !== "undefined" && document.visibilityState === "hidden" ? 30_000 : 5_000;
}

export type PlicaLayoutMode = "auto" | "1" | "2" | "3";

export const PLICA_LAYOUT_STORAGE_KEY = "plica.layout";

// "2"/"3" are caps, not forces: below the breakpoints they fall back to
// fewer columns so a persisted "3" on a narrow window never yields
// unreadably crushed panes. "auto" gains a 4th column on very wide walls.
export const PLICA_LAYOUT_CLASSES: Record<PlicaLayoutMode, string> = {
  auto: "md:grid-cols-2 2xl:grid-cols-3 min-[2200px]:grid-cols-4",
  "1": "grid-cols-1",
  "2": "sm:grid-cols-2",
  "3": "md:grid-cols-2 xl:grid-cols-3",
};

export function normalizeLayoutMode(value: string | null | undefined): PlicaLayoutMode {
  return value === "1" || value === "2" || value === "3" ? value : "auto";
}

export function selectCeo(agents: Agent[]): Agent | undefined {
  return agents.find((agent) => agent.role === "ceo");
}

export type PlicaCeoHeartbeatState = "ok" | "overdue" | "off";

export interface PlicaCeoHeartbeat {
  state: PlicaCeoHeartbeatState;
  lastBeatAt: string | null;
  intervalSec: number | null;
}

// runtimeConfig.heartbeat is untyped on this codebase generation — narrow it defensively.
function readHeartbeatConfig(agent: Agent): { enabled: boolean; intervalSec: number | null } {
  const raw = (agent.runtimeConfig as Record<string, unknown> | null | undefined)?.heartbeat;
  if (!raw || typeof raw !== "object") return { enabled: false, intervalSec: null };
  const config = raw as { enabled?: unknown; intervalSec?: unknown };
  return {
    enabled: config.enabled === true,
    intervalSec: typeof config.intervalSec === "number" && config.intervalSec > 0 ? config.intervalSec : null,
  };
}

export function deriveCeoHeartbeat(agent: Agent | undefined, nowMs: number): PlicaCeoHeartbeat {
  if (!agent) return { state: "off", lastBeatAt: null, intervalSec: null };
  const { enabled, intervalSec } = readHeartbeatConfig(agent);
  const lastBeatAt = agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toISOString() : null;
  if (!enabled || agent.status === "paused" || !lastBeatAt) {
    return { state: "off", lastBeatAt, intervalSec };
  }
  if (intervalSec !== null && nowMs - new Date(lastBeatAt).getTime() > intervalSec * 1500) {
    return { state: "overdue", lastBeatAt, intervalSec };
  }
  return { state: "ok", lastBeatAt, intervalSec };
}

export function relativeTimeLabel(fromIso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function intervalLabel(intervalSec: number | null): string | null {
  if (intervalSec === null) return null;
  if (intervalSec % 3600 === 0) return `every ${intervalSec / 3600}h`;
  if (intervalSec >= 60) return `every ${Math.round(intervalSec / 60)}m`;
  return `every ${intervalSec}s`;
}

export type PlicaViewMode = "wall" | "triage" | "feed" | "analytic";

export const PLICA_VIEW_STORAGE_KEY = "plica.view";

const PLICA_VIEW_MODES: ReadonlyArray<PlicaViewMode> = ["wall", "triage", "feed", "analytic"];

export function normalizeViewMode(value: string | null | undefined): PlicaViewMode {
  return PLICA_VIEW_MODES.includes(value as PlicaViewMode) ? (value as PlicaViewMode) : "wall";
}

export const PLICA_ALERTS_STORAGE_KEY = "plica.alerts";

export function normalizeAlertsEnabled(value: string | null | undefined): boolean {
  return value === "on";
}

export interface PlicaActionable {
  criticalOrHigh: boolean;
  count: number;
}

/**
 * Computes the "actionable" summary (used for triage counts/ordering) from
 * the pieces of PlicaCompanyData that matter for it: pending approvals,
 * undismissed attention items, and whether the CEO heartbeat is overdue.
 * Kept as a plain data-in shape (rather than taking PlicaCompanyData
 * directly) so it stays trivially unit-testable without the hook.
 */
export function deriveActionable(data: {
  approvals: Approval[];
  attention: AttentionFeed | undefined;
  ceoOverdue: boolean;
}): PlicaActionable {
  const undismissedAttention = (data.attention?.items ?? []).filter((item) => !item.dismissal);
  const criticalOrHigh = undismissedAttention.some(
    (item) => item.severity === "critical" || item.severity === "high",
  );
  // The attention feed emits one item per pending approval — those are
  // already counted via `approvals`, so exclude them here or every approval
  // counts twice. (Severity still contributes to criticalOrHigh above.)
  const nonApprovalAttention = undismissedAttention.filter((item) => item.sourceKind !== "approval");
  const count = data.approvals.length + nonApprovalAttention.length + (data.ceoOverdue ? 1 : 0);
  return { criticalOrHigh, count };
}

/**
 * Orders companies for the triage list: those with any critical/high
 * attention item first, then by actionable count descending, then by
 * name ascending. Pure so it can be unit-tested without the polling hooks.
 */
/**
 * Flattens an approval payload into key/value display rows for the
 * approval preview: primitives render as-is, objects/arrays are
 * JSON.stringify'd, and every value is truncated to `maxLen` characters so
 * a huge blob doesn't blow out the row. Pure so it's unit-testable without
 * mounting PlicaApprovalRow.
 */
export function summarizePayloadEntries(
  payload: Record<string, unknown>,
  maxLen = 120,
): Array<{ key: string; value: string }> {
  return Object.entries(payload).map(([key, value]) => {
    const text = value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
    return { key, value: text.length > maxLen ? text.slice(0, maxLen) : text };
  });
}

/**
 * Derives a CEO-nudge issue title from the free-text draft: the first
 * line, trimmed and capped at 140 characters (the issue title limit).
 */
export function nudgeTitle(text: string): string {
  const firstLine = (text.trim().split("\n")[0] ?? "").trim();
  return firstLine.length > 140 ? firstLine.slice(0, 140) : firstLine;
}

export function orderTriageCompanies<T extends { company: Company; actionable: PlicaActionable }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    if (a.actionable.criticalOrHigh !== b.actionable.criticalOrHigh) {
      return a.actionable.criticalOrHigh ? -1 : 1;
    }
    if (a.actionable.count !== b.actionable.count) {
      return b.actionable.count - a.actionable.count;
    }
    return a.company.name.localeCompare(b.company.name);
  });
}

export interface PlicaSparklineDay {
  date: string;
  label: string;
  succeeded: number;
  failed: number;
  total: number;
  succeededHeightPct: number;
  failedHeightPct: number;
  hasActivity: boolean;
  title: string;
}

/**
 * Normalizes the trailing `count` days of `runActivity` into display-ready
 * sparkline bars: succeeded/failed heights are scaled as a percentage of the
 * max day total across the window (so bars are comparable at a glance), and
 * a day with zero runs is flagged via `hasActivity` so the renderer can draw
 * a 1px baseline mark instead of an empty gap. Pure so it's unit-testable
 * without mounting PlicaSparkline.
 */
export function sparklineDays(runActivity: DashboardRunActivityDay[], count = 7): PlicaSparklineDay[] {
  const days = runActivity.slice(-count);
  const max = Math.max(1, ...days.map((day) => day.succeeded + day.failed));
  return days.map((day) => {
    const total = day.succeeded + day.failed;
    const label = new Date(day.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return {
      date: day.date,
      label,
      succeeded: day.succeeded,
      failed: day.failed,
      total,
      succeededHeightPct: total === 0 ? 0 : (day.succeeded / max) * 100,
      failedHeightPct: total === 0 ? 0 : (day.failed / max) * 100,
      hasActivity: total > 0,
      title: `${label}: ${day.succeeded} ok, ${day.failed} failed`,
    };
  });
}

export type PlicaAlertHealth = "red" | "amber" | "green";

export interface PlicaAlertSnapshot {
  health: PlicaAlertHealth;
  criticalAttentionIds: string[];
  ceoOverdue: boolean;
}

export type PlicaAlertEventKind = "health_red" | "critical_attention" | "ceo_overdue";

export interface PlicaAlertEvent {
  kind: PlicaAlertEventKind;
  detail?: string;
}

export const PLICA_LAST_VISIT_STORAGE_KEY = "plica.lastVisit";

/**
 * Whether the briefing strip (§7) should show: there must be a recorded
 * previous visit, and it must have been more than 30 minutes ago. A null
 * `lastVisitIso` (first-ever visit, or storage unavailable) never shows
 * the briefing — there is nothing to summarize.
 */
export function shouldShowBriefing(lastVisitIso: string | null, nowMs: number): boolean {
  if (!lastVisitIso) return false;
  const elapsedMs = nowMs - new Date(lastVisitIso).getTime();
  return elapsedMs > 30 * 60_000;
}

export interface PlicaBriefingCounts {
  done: number;
  blockers: number;
  failedRuns: number;
}

/**
 * Minimal shapes this helper needs — declared structurally here (rather
 * than imported from `@paperclipai/shared`) so fixtures in tests don't
 * need to satisfy the full `Issue` / `WorkTimelineResult` DTOs.
 */
export interface PlicaBriefingIssueInput {
  status?: string | null;
  /** Issue.updatedAt: typed `Date` on the shared DTO, but arrives as an
   * ISO string over the wire — accept either and normalize below. */
  updatedAt?: Date | string | null;
}
export interface PlicaBriefingTimelineSpan {
  status?: string | null;
}
export interface PlicaBriefingTimelineInput {
  spans?: PlicaBriefingTimelineSpan[];
}

// heartbeatRuns.status values that represent a terminal failure — mirrors
// FAILED_RUN_STATUSES in ui/src/lib/inbox.ts (kept independent here so this
// module has no dependency on inbox.ts's unrelated concerns).
const FAILED_RUN_STATUSES = new Set(["failed", "timed_out"]);

/**
 * Derives the briefing-line counts (§7).
 *
 * - `done` / `blockers` come from a *separate* issues fetch
 *   (`issuesApi.list(companyId, { status: "done,blocked" })`, batched
 *   alongside the timeline query in PlicaBriefing) rather than the
 *   work-timeline payload: `WorkTimelineEvent.kind` (created/commented/
 *   approved/delegated/assigned — see server/src/services/work-timeline.ts)
 *   carries no issue-status-transition signal, so there is no reliable way
 *   to know *when* an issue became done/blocked from the timeline alone.
 *   Instead, an issue counts if its current `status` is "done"/"blocked"
 *   AND its `updatedAt` is after `sinceIso`. This is a "changed since"
 *   approximation, not a true transition log — an issue that was already
 *   done and merely touched again (e.g. a comment) after `sinceIso` will
 *   still count. Acceptable for a glanceable briefing.
 * - `failedRuns` is still timeline-derived: `spans[].status`
 *   (heartbeatRuns.status) equal to a terminal-failure run status
 *   ("failed" | "timed_out").
 *
 * Pure so it's unit-testable without the polling hooks.
 */
export function deriveBriefingLine(input: {
  issues?: PlicaBriefingIssueInput[];
  timelineEntries?: PlicaBriefingTimelineInput;
  sinceIso: string;
}): PlicaBriefingCounts {
  const sinceMs = new Date(input.sinceIso).getTime();
  let done = 0;
  let blockers = 0;
  for (const issue of input.issues ?? []) {
    if (!issue.updatedAt) continue;
    const updatedMs = new Date(issue.updatedAt).getTime();
    if (Number.isNaN(updatedMs) || updatedMs <= sinceMs) continue;
    if (issue.status === "done") done += 1;
    else if (issue.status === "blocked") blockers += 1;
  }
  let failedRuns = 0;
  for (const span of input.timelineEntries?.spans ?? []) {
    if (span.status && FAILED_RUN_STATUSES.has(span.status)) failedRuns += 1;
  }
  return { done, blockers, failedRuns };
}

/**
 * Compares two consecutive poll snapshots and returns the alert-worthy
 * transitions: pane health entering red, a critical-severity attention item
 * id appearing for the first time, and the CEO heartbeat transitioning to
 * overdue. `prev === null` means this is the first snapshot ever taken (no
 * baseline to compare against) — returns [] silently so first load never
 * alerts. Pure so it's unit-testable without the polling hook.
 */

export function detectAlertEdges(prev: PlicaAlertSnapshot | null, next: PlicaAlertSnapshot): PlicaAlertEvent[] {
  if (prev === null) return [];
  const events: PlicaAlertEvent[] = [];
  if (prev.health !== "red" && next.health === "red") {
    events.push({ kind: "health_red" });
  }
  const prevCritical = new Set(prev.criticalAttentionIds);
  for (const id of next.criticalAttentionIds) {
    if (!prevCritical.has(id)) {
      events.push({ kind: "critical_attention", detail: id });
    }
  }
  if (!prev.ceoOverdue && next.ceoOverdue) {
    events.push({ kind: "ceo_overdue" });
  }
  return events;
}

export type PlicaSortMode = "manual" | "hot";

export const PLICA_SORT_STORAGE_KEY = "plica.sort";

export function normalizeSortMode(value: string | null | undefined): PlicaSortMode {
  return value === "hot" ? "hot" : "manual";
}

/**
 * Stable partition: items whose id is in hotIds move to the front, both groups
 * keeping their original relative order — so the wall only reshuffles when a
 * company enters/leaves the hot set, never on ordinary polls.
 */
export function partitionHotFirst<T extends { id: string }>(items: T[], hotIds: Set<string>): T[] {
  const hot: T[] = [];
  const rest: T[] = [];
  for (const item of items) (hotIds.has(item.id) ? hot : rest).push(item);
  return [...hot, ...rest];
}

export interface PlicaTriageSummaryPart {
  label: string;
  tone: "critical" | "warn" | "muted";
}

/**
 * Plain-language summary parts for a company's collapsed triage row, e.g.
 * [{2 blockers, critical}, {1 approval, warn}, {1 failed run, warn}].
 * Empty array = clear.
 */
export function deriveTriageSummary(input: {
  approvalCount: number;
  attention: AttentionFeed | undefined;
  ceoOverdue: boolean;
}): PlicaTriageSummaryPart[] {
  const items = (input.attention?.items ?? []).filter((item) => !item.dismissal);
  const blockers = items.filter((item) => item.sourceKind === "blocker_attention").length;
  const failed = items.filter((item) => item.sourceKind === "failed_run").length;
  // Approval-sourced attention items duplicate `approvalCount` — don't let
  // them inflate the "attention item" bucket too.
  const approvalItems = items.filter((item) => item.sourceKind === "approval").length;
  const other = items.length - blockers - failed - approvalItems;
  const parts: PlicaTriageSummaryPart[] = [];
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  if (blockers > 0) parts.push({ label: plural(blockers, "blocker"), tone: "critical" });
  if (input.approvalCount > 0) parts.push({ label: plural(input.approvalCount, "approval"), tone: "warn" });
  if (failed > 0) parts.push({ label: plural(failed, "failed run"), tone: "warn" });
  if (input.ceoOverdue) parts.push({ label: "CEO overdue", tone: "warn" });
  if (other > 0) parts.push({ label: plural(other, "attention item"), tone: "muted" });
  return parts;
}

/**
 * Human line for an attention item's detail payload — the actual question,
 * confirmation prompt, failure reason, etc. Null when there's nothing
 * beyond the item's whyNow line.
 */
export function attentionDetailText(detail: AttentionItem["detail"]): string | null {
  if (!detail) return null;
  switch (detail.kind) {
    case "approval":
    case "plan_approval":
    case "generic":
      return detail.summaryExcerpt;
    case "confirmation":
    case "checkbox_confirmation":
    case "item_verdicts":
      return detail.promptExcerpt;
    case "questions":
      return detail.firstQuestionText
        ? `${detail.questionCount} question${detail.questionCount === 1 ? "" : "s"} — “${detail.firstQuestionText}”`
        : `${detail.questionCount} question${detail.questionCount === 1 ? "" : "s"} awaiting answers`;
    case "suggested_tasks":
      return detail.firstTaskTitle
        ? `${detail.taskCount} suggested task${detail.taskCount === 1 ? "" : "s"} — first: ${detail.firstTaskTitle}`
        : null;
    case "failed_run":
    case "agent_error":
      return detail.failureReasonExcerpt;
    case "blocker":
      return detail.blockingIssue
        ? `blocked by ${detail.blockingIssue.identifier ?? detail.blockingIssue.id ?? "?"}${detail.blockingIssue.title ? ` — ${detail.blockingIssue.title}` : ""}`
        : null;
    case "budget":
      return `${detail.observedPercent}% of budget used ($${(detail.amountObserved / 100).toFixed(2)} of $${(detail.amountLimit / 100).toFixed(2)})`;
    default:
      return null;
  }
}

export const PLICA_COLLAPSED_STORAGE_KEY = "plica.collapsed";

/** Parse the persisted collapsed-company id list, tolerating junk. */
export function normalizeCollapsedIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export const PLICA_PINNED_STORAGE_KEY = "plica.pinned";

/** Parse the persisted pinned-company id list, tolerating junk. */
export function normalizePinnedIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * How the pinned bar presents a company. Separate from PlicaViewMode because
 * the bar and the workspace answer different questions and are switched
 * independently — you can watch four companies as a heatmap up top while
 * reading the rest as panes below.
 */
export type PlicaBarMode = "signal" | "matrix" | "scoreboard" | "tote";

/**
 * Everything PlicaCompanySlot can render a company as. One union so the slot
 * keeps a single data poll no matter which zone it is rendering into.
 */
export type PlicaSlotPresentation = PlicaViewMode | PlicaBarMode;

export const PLICA_BAR_STORAGE_KEY = "plica.bar";

const PLICA_BAR_MODES: ReadonlyArray<PlicaBarMode> = ["signal", "matrix", "scoreboard", "tote"];

export function normalizeBarMode(value: string | null | undefined): PlicaBarMode {
  return PLICA_BAR_MODES.includes(value as PlicaBarMode) ? (value as PlicaBarMode) : "signal";
}

/**
 * The attention kinds the bar rolls up, in the order they appear. Ordered by
 * how much they demand of you rather than alphabetically, so the leftmost
 * cells are the ones worth looking at first. Labels are deliberately short —
 * they sit in a ~60px cell and must not wrap at kiosk scale.
 *
 * Covers every member of ATTENTION_SOURCE_KINDS; a feed carrying a kind we
 * don't know about still counts toward the card total via attentionKindSummary,
 * it just has no cell of its own.
 */
export const PLICA_ATTENTION_KINDS: ReadonlyArray<{ kind: AttentionItem["sourceKind"]; label: string }> = [
  { kind: "blocker_attention", label: "Blocked" },
  { kind: "failed_run", label: "Failed" },
  { kind: "agent_error_alert", label: "Errors" },
  { kind: "approval", label: "Approve" },
  { kind: "decision", label: "Decide" },
  { kind: "issue_thread_interaction", label: "Answer" },
  { kind: "review", label: "Review" },
  { kind: "recovery_action", label: "Recover" },
  { kind: "join_request", label: "Access" },
  { kind: "budget_alert", label: "Budget" },
  { kind: "productivity_review", label: "Report" },
];

export type PlicaKindCell = {
  kind: AttentionItem["sourceKind"];
  label: string;
  count: number;
  /** Worst severity present in this cell, or null when the cell is empty. */
  worst: AttentionSeverity | null;
};

export interface PlicaKindSummary {
  cells: PlicaKindCell[];
  /** Every live item, including kinds with no cell of their own. */
  total: number;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** The worst severity in a set, or null when the set is empty. */
export function worstSeverity(items: ReadonlyArray<Pick<AttentionItem, "severity">>): AttentionSeverity | null {
  let worst: AttentionSeverity | null = null;
  for (const item of items) {
    if (worst === null || SEVERITY_RANK[item.severity] < SEVERITY_RANK[worst]) worst = item.severity;
  }
  return worst;
}

/**
 * Roll an attention feed up into one cell per kind. Dismissed items are
 * excluded to match what the panes below already show — a card that counted
 * dismissed work would send you looking for something that isn't there.
 */
export function attentionKindSummary(attention: AttentionFeed | undefined): PlicaKindSummary {
  const live = (attention?.items ?? []).filter((item) => !item.dismissal);
  return {
    cells: PLICA_ATTENTION_KINDS.map(({ kind, label }) => {
      const inKind = live.filter((item) => item.sourceKind === kind);
      return { kind, label, count: inKind.length, worst: worstSeverity(inKind) };
    }),
    total: live.length,
  };
}

/**
 * Total tokens a company burned over the rows returned by costs/by-agent.
 *
 * Counts input + cached input + output, and the subscription-billed columns
 * alongside the API-billed ones — a fleet running on a subscription plan would
 * otherwise report zero, which reads as "idle" rather than "billed elsewhere".
 */
export function sumAgentTokens(rows: ReadonlyArray<CostByAgent> | undefined): number {
  return (rows ?? []).reduce(
    (total, row) =>
      total +
      (row.inputTokens ?? 0) +
      (row.cachedInputTokens ?? 0) +
      (row.outputTokens ?? 0) +
      (row.subscriptionInputTokens ?? 0) +
      (row.subscriptionCachedInputTokens ?? 0) +
      (row.subscriptionOutputTokens ?? 0),
    0,
  );
}

/** Compact token counts: 1.19B, 574M, 99.3M, 250K. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}

/**
 * Absolute monthly token thresholds. Paperclip has no token budget concept, so
 * there is no denominator to express these as a percentage of — a company is
 * over a number you chose, not over a cap the system knows about.
 */
export interface PlicaTokenThresholds {
  warn: number;
  crit: number;
}

export const PLICA_TOKEN_DEFAULTS: PlicaTokenThresholds = { warn: 250_000_000, crit: 500_000_000 };

export function tokenState(tokens: number, thresholds: PlicaTokenThresholds): "crit" | "warn" | "ok" {
  if (tokens > thresholds.crit) return "crit";
  if (tokens > thresholds.warn) return "warn";
  return "ok";
}

/**
 * First-of-month through today, as the ISO dates the costs endpoints expect.
 * Tokens are quoted per calendar month because that is the window budgets and
 * invoices use; a rolling 30 days would not line up with either.
 */
export function currentMonthRange(nowMs: number): { from: string; to: string } {
  const now = new Date(nowMs);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: iso(now) };
}

/**
 * The compact per-company facts the bar's cross-company modes need. Slots
 * derive this from data they already hold and report it up, so Scoreboard can
 * lay companies side by side and Tote can add them together without either
 * one owning a second copy of the fetching.
 */
export interface PlicaCompanyStats {
  running: number;
  active: number;
  tasks: number;
  /** Live attention items, dismissed excluded. */
  needs: number;
  critical: number;
  failed: number;
  /** Age in minutes of the oldest live attention item, or null when clear. */
  oldestMins: number | null;
  inbox: number;
  /** Undefined when the costs endpoint is unavailable to this user. */
  tokens: number | undefined;
  unavailable: boolean;
}

export function deriveCompanyStats(input: {
  summary: DashboardSummary | undefined;
  attention: AttentionFeed | undefined;
  badges: { inbox: number } | undefined;
  tokens: number | undefined;
  unavailable: boolean;
  nowMs: number;
}): PlicaCompanyStats {
  const live = (input.attention?.items ?? []).filter((item) => !item.dismissal);
  const ages = live
    .map((item) => (item.activityAt ? Math.round((input.nowMs - new Date(item.activityAt).getTime()) / 60_000) : null))
    .filter((mins): mins is number => mins !== null && Number.isFinite(mins) && mins >= 0);
  return {
    running: input.summary?.agents.running ?? 0,
    active: input.summary?.agents.active ?? 0,
    tasks: input.summary?.tasks.inProgress ?? 0,
    needs: live.length,
    critical: live.filter((item) => item.severity === "critical").length,
    failed: live.filter((item) => item.sourceKind === "failed_run").length,
    oldestMins: ages.length ? Math.max(...ages) : null,
    inbox: input.badges?.inbox ?? 0,
    tokens: input.tokens,
    unavailable: input.unavailable,
  };
}

/** Compact ages for the bar: 18m, 4h, 2d. */
export function formatAgeMinutes(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export const PLICA_TOKEN_THRESHOLDS_STORAGE_KEY = "plica.tokenThresholds";

export interface PlicaTokenSettings {
  /** Applies to every company without an override of its own. */
  defaults: PlicaTokenThresholds;
  /** companyId -> thresholds. Absent means "inherit the default". */
  overrides: Record<string, PlicaTokenThresholds>;
}

function readThresholds(value: unknown): PlicaTokenThresholds | null {
  if (!value || typeof value !== "object") return null;
  const { warn, crit } = value as Record<string, unknown>;
  if (typeof warn !== "number" || typeof crit !== "number") return null;
  if (!Number.isFinite(warn) || !Number.isFinite(crit) || warn <= 0 || crit <= warn) return null;
  return { warn, crit };
}

/** Parse persisted token settings, falling back to defaults for anything junk. */
export function normalizeTokenSettings(raw: string | null | undefined): PlicaTokenSettings {
  const empty: PlicaTokenSettings = { defaults: PLICA_TOKEN_DEFAULTS, overrides: {} };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const overrides: Record<string, PlicaTokenThresholds> = {};
    const rawOverrides = parsed.overrides;
    if (rawOverrides && typeof rawOverrides === "object") {
      for (const [companyId, value] of Object.entries(rawOverrides as Record<string, unknown>)) {
        const thresholds = readThresholds(value);
        if (thresholds) overrides[companyId] = thresholds;
      }
    }
    return { defaults: readThresholds(parsed.defaults) ?? PLICA_TOKEN_DEFAULTS, overrides };
  } catch {
    return empty;
  }
}

/**
 * The thresholds a company is actually judged by. A company with no override
 * inherits, rather than holding a copy — so raising the default afterwards
 * still moves everyone who never opted out.
 */
export function thresholdsFor(settings: PlicaTokenSettings, companyId: string): PlicaTokenThresholds {
  return settings.overrides[companyId] ?? settings.defaults;
}

/**
 * Thresholds for a group read as one number. Summing each member's own
 * thresholds keeps the aggregate on the same footing as the rows that compose
 * it, including any overrides, instead of needing a second pair of numbers
 * that drifts whenever the per-company ones are tuned.
 */
export function aggregateTokenState(
  settings: PlicaTokenSettings,
  members: ReadonlyArray<{ id: string; tokens: number | undefined }>,
): { total: number; state: "crit" | "warn" | "ok"; known: boolean } {
  const known = members.some((member) => member.tokens !== undefined);
  const total = members.reduce((sum, member) => sum + (member.tokens ?? 0), 0);
  const warn = members.reduce((sum, member) => sum + thresholdsFor(settings, member.id).warn, 0);
  const crit = members.reduce((sum, member) => sum + thresholdsFor(settings, member.id).crit, 0);
  return { total, state: total > crit ? "crit" : total > warn ? "warn" : "ok", known };
}

/**
 * How the panes render attention items.
 *
 * "card" is the original: the model's prose leads at line-clamp-2 with a meta
 * line beneath, so a row is two or three lines depending on what was written
 * and no two panes line up. The other two fix that by leading with the stable
 * noun — identifier and subject title — and demoting prose.
 */
export type PlicaRowMode = "card" | "ledger" | "digest";

export const PLICA_ROWS_STORAGE_KEY = "plica.rows";

const PLICA_ROW_MODES: ReadonlyArray<PlicaRowMode> = ["card", "ledger", "digest"];

export function normalizeRowMode(value: string | null | undefined): PlicaRowMode {
  return PLICA_ROW_MODES.includes(value as PlicaRowMode) ? (value as PlicaRowMode) : "ledger";
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Worst first, then oldest first within a severity. */
export function compareAttention(a: AttentionItem, b: AttentionItem): number {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity !== 0) return bySeverity;
  return (a.activityAt ? new Date(a.activityAt).getTime() : 0) - (b.activityAt ? new Date(b.activityAt).getTime() : 0);
}

export interface PlicaAttentionGroup {
  kind: AttentionItem["sourceKind"];
  label: string;
  items: AttentionItem[];
  worst: AttentionSeverity | null;
}

/**
 * Group items by kind for the digest, in the bar's kind order so a company
 * reads the same way whichever surface you meet it on. Unknown kinds are kept
 * under their own raw name rather than dropped.
 */
export function groupAttentionByKind(items: ReadonlyArray<AttentionItem>): PlicaAttentionGroup[] {
  const groups: PlicaAttentionGroup[] = [];
  const seen = new Set<string>();
  for (const { kind, label } of PLICA_ATTENTION_KINDS) {
    const inKind = items.filter((item) => item.sourceKind === kind);
    seen.add(kind);
    if (inKind.length) groups.push({ kind, label, items: [...inKind].sort(compareAttention), worst: worstSeverity(inKind) });
  }
  for (const item of items) {
    if (seen.has(item.sourceKind)) continue;
    seen.add(item.sourceKind);
    const inKind = items.filter((other) => other.sourceKind === item.sourceKind);
    groups.push({
      kind: item.sourceKind,
      label: item.sourceKind.replace(/_/g, " "),
      items: [...inKind].sort(compareAttention),
      worst: worstSeverity(inKind),
    });
  }
  return groups;
}

/** Minutes since an item last moved, or null when it carries no timestamp. */
export function attentionAgeMinutes(item: { activityAt: string | null }, nowMs: number): number | null {
  if (!item.activityAt) return null;
  const mins = Math.round((nowMs - new Date(item.activityAt).getTime()) / 60_000);
  return Number.isFinite(mins) && mins >= 0 ? mins : null;
}

/** Which slice of the merged feed is showing. */
export type PlicaFeedFilter = "all" | "unseen" | "urgent";

/**
 * Merge every company's attention into one stream, newest first.
 *
 * The only cross-company ordering in Plica: a fresh blocker at one company
 * outranks a stale one at another, which no side-by-side arrangement of panes
 * can express because each pane only sorts against itself.
 */
export function mergeAttentionFeed<T extends { id: string }>(
  entries: ReadonlyArray<{ company: T; items: ReadonlyArray<AttentionItem> | undefined }>,
): Array<{ company: T; item: AttentionItem }> {
  const merged: Array<{ company: T; item: AttentionItem }> = [];
  for (const { company, items } of entries) {
    for (const item of items ?? []) {
      if (!item.dismissal) merged.push({ company, item });
    }
  }
  // Newest first; items with no timestamp sort last rather than pretending to
  // be from 1970 and dominating the top of the stream.
  return merged.sort((a, b) => {
    const at = a.item.activityAt ? new Date(a.item.activityAt).getTime() : Number.NEGATIVE_INFINITY;
    const bt = b.item.activityAt ? new Date(b.item.activityAt).getTime() : Number.NEGATIVE_INFINITY;
    return bt - at;
  });
}

export function filterFeed<T>(
  rows: ReadonlyArray<{ company: T; item: AttentionItem }>,
  filter: PlicaFeedFilter,
  sinceMs: number | null,
): Array<{ company: T; item: AttentionItem }> {
  if (filter === "urgent") return rows.filter((row) => row.item.severity === "critical" || row.item.severity === "high");
  if (filter === "unseen") {
    if (sinceMs === null) return [...rows];
    return rows.filter((row) => Boolean(row.item.activityAt) && new Date(row.item.activityAt).getTime() > sinceMs);
  }
  return [...rows];
}

/**
 * How long attention has been sitting, in buckets.
 *
 * Every other surface ranks by severity, so a medium item nobody has touched
 * in two days sits below a high one from ten minutes ago forever. This is the
 * only place neglect is visible, which is why the oldest bucket is the one
 * that earns a colour.
 */
export const PLICA_AGE_BUCKETS: ReadonlyArray<{ label: string; maxMins: number }> = [
  { label: "<1h", maxMins: 60 },
  { label: "1–4h", maxMins: 240 },
  { label: "4–12h", maxMins: 720 },
  { label: ">12h", maxMins: Number.POSITIVE_INFINITY },
];

export function bucketAttentionByAge(
  items: ReadonlyArray<{ activityAt: string | null }>,
  nowMs: number,
): Array<{ label: string; count: number; stale: boolean }> {
  return PLICA_AGE_BUCKETS.map((bucket, index) => {
    const floor = index === 0 ? 0 : PLICA_AGE_BUCKETS[index - 1].maxMins;
    const count = items.filter((item) => {
      const mins = attentionAgeMinutes(item, nowMs);
      // Items with no timestamp have no age to bucket; counting them as fresh
      // would understate neglect and as ancient would invent it.
      return mins !== null && mins >= floor && mins < bucket.maxMins;
    }).length;
    return { label: bucket.label, count, stale: index === PLICA_AGE_BUCKETS.length - 1 && count > 0 };
  });
}
