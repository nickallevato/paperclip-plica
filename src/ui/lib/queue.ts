import type {
  Agent,
  Approval,
  AttentionFeed,
  AttentionItem,
  Company,
  Issue,
  Project,
  RoutineListItem,
} from "@paperclipai/shared";
import type { LiveRunForIssue } from "../host/api";
import { isRunActive, runPhase, type RunPhase } from "./runs";
import {
  PLICA_ROUTINE_OVERDUE_GRACE_MS,
  attentionIssueId,
  deriveCeoHeartbeat,
  selectCeo,
  type PlicaCeoHeartbeat,
} from "./plica";

/**
 * The "Needs you" queue: everything across every company that is waiting on a
 * human, in one list, in the order you should work it.
 *
 * Three buckets, by how long the thing can wait:
 *   now   — approvals, critical attention, an overdue CEO heartbeat
 *   soon  — high attention, routines that stopped firing or whose last run failed
 *   later — medium / low attention (shown as a count, expanded on demand)
 *
 * Pure functions over the pieces of PlicaCompanyData, like the other derive*
 * helpers, so the bucketing is unit-tested without the polling hook.
 */
export type PlicaQueueBucket = "now" | "soon" | "later";

export const PLICA_QUEUE_BUCKETS: ReadonlyArray<{ bucket: PlicaQueueBucket; label: string }> = [
  { bucket: "now", label: "Now" },
  { bucket: "soon", label: "Soon" },
  { bucket: "later", label: "Later" },
];

interface PlicaQueueItemBase {
  /** Stable across polls: `${kind}:${source id}`. */
  id: string;
  companyId: string;
  bucket: PlicaQueueBucket;
  /** Lower sorts first within a bucket. */
  rank: number;
  /** When the item started needing you (epoch ms), or null when unknown. */
  atMs: number | null;
}

export type PlicaQueueItem =
  | (PlicaQueueItemBase & { kind: "approval"; approval: Approval; requestedBy: string | null })
  | (PlicaQueueItemBase & {
      kind: "attention";
      item: AttentionItem;
      /** The issue the item is about, when it is about one we hold. */
      issue: Issue | null;
    })
  | (PlicaQueueItemBase & { kind: "heartbeat"; ceo: Agent; beat: PlicaCeoHeartbeat })
  | (PlicaQueueItemBase & { kind: "routine"; routine: RoutineListItem; reason: "overdue" | "failed" });

const BUCKET_ORDER: Record<PlicaQueueBucket, number> = { now: 0, soon: 1, later: 2 };

const PHASE_ORDER: Record<RunPhase, number> = { working: 0, queued: 1 };

function epochMs(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function attentionBucket(severity: AttentionItem["severity"]): { bucket: PlicaQueueBucket; rank: number } {
  switch (severity) {
    case "critical":
      return { bucket: "now", rank: 0 };
    case "high":
      return { bucket: "soon", rank: 2 };
    case "medium":
      return { bucket: "later", rank: 4 };
    default:
      return { bucket: "later", rank: 5 };
  }
}

export function deriveQueueItems(input: {
  companyId: string;
  approvals: ReadonlyArray<Approval>;
  attention: AttentionFeed | undefined;
  agents: ReadonlyArray<Agent>;
  routines: ReadonlyArray<RoutineListItem>;
  /** Optional; lets attention rows name the issue behind a thread interaction. */
  issues?: ReadonlyArray<Issue>;
  nowMs: number;
}): PlicaQueueItem[] {
  const items: PlicaQueueItem[] = [];
  const agentName = new Map(input.agents.map((agent) => [agent.id, agent.name]));
  const issueById = new Map((input.issues ?? []).map((issue) => [issue.id, issue]));

  for (const approval of input.approvals) {
    items.push({
      kind: "approval",
      id: `approval:${approval.id}`,
      companyId: input.companyId,
      bucket: "now",
      rank: 1,
      atMs: epochMs(approval.createdAt),
      approval,
      requestedBy: approval.requestedByAgentId ? (agentName.get(approval.requestedByAgentId) ?? null) : null,
    });
  }

  // The attention feed emits one item per pending approval; those are already
  // in the queue via `approvals` (with their Approve/Reject actions), so they
  // are skipped here — the same exclusion deriveActionable makes.
  for (const item of input.attention?.items ?? []) {
    if (item.dismissal || item.sourceKind === "approval") continue;
    const { bucket, rank } = attentionBucket(item.severity);
    items.push({
      kind: "attention",
      id: `attention:${item.id}`,
      companyId: input.companyId,
      bucket,
      rank,
      atMs: epochMs(item.activityAt),
      item,
      issue: (() => {
        const issueId = attentionIssueId(item);
        return issueId ? (issueById.get(issueId) ?? null) : null;
      })(),
    });
  }

  const ceo = selectCeo([...input.agents]);
  const beat = deriveCeoHeartbeat(ceo, input.nowMs);
  if (ceo && beat.state === "overdue") {
    items.push({
      kind: "heartbeat",
      id: `heartbeat:${ceo.id}`,
      companyId: input.companyId,
      bucket: "now",
      rank: 1,
      atMs: epochMs(beat.lastBeatAt),
      ceo,
      beat,
    });
  }

  // A routine that stopped firing produces no attention item and no failed
  // run — this is the only place it becomes visible.
  for (const routine of input.routines) {
    if (routine.status !== "active") continue;
    const overdueAt = (routine.triggers ?? [])
      .filter((trigger) => trigger.enabled && trigger.nextRunAt)
      .map((trigger) => epochMs(trigger.nextRunAt as unknown as string))
      .filter((ms): ms is number => ms !== null && ms < input.nowMs - PLICA_ROUTINE_OVERDUE_GRACE_MS)
      .sort((a, b) => a - b)[0];
    if (overdueAt !== undefined) {
      items.push({
        kind: "routine",
        id: `routine:${routine.id}:overdue`,
        companyId: input.companyId,
        bucket: "soon",
        rank: 3,
        atMs: overdueAt,
        routine,
        reason: "overdue",
      });
    } else if (routine.lastRun?.status === "failed") {
      items.push({
        kind: "routine",
        id: `routine:${routine.id}:failed`,
        companyId: input.companyId,
        bucket: "soon",
        rank: 3,
        atMs: epochMs(routine.lastRun.completedAt ?? routine.lastRun.triggeredAt),
        routine,
        reason: "failed",
      });
    }
  }

  return items;
}

/** Bucket, then rank, then oldest first (unknown ages last). */
export function compareQueueItems(a: PlicaQueueItem, b: PlicaQueueItem): number {
  const byBucket = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
  if (byBucket !== 0) return byBucket;
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.atMs === null && b.atMs === null) return 0;
  if (a.atMs === null) return 1;
  if (b.atMs === null) return -1;
  return a.atMs - b.atMs;
}

export function queueItemAgeMinutes(item: { atMs: number | null }, nowMs: number): number | null {
  if (item.atMs === null) return null;
  const mins = Math.round((nowMs - item.atMs) / 60_000);
  return Number.isFinite(mins) && mins >= 0 ? mins : null;
}

export interface PlicaQueueSummary {
  now: number;
  soon: number;
  later: number;
  total: number;
  /** Age of the oldest Now/Soon item in minutes, or null when those are empty. */
  oldestMins: number | null;
}

export function summarizeQueue(items: ReadonlyArray<PlicaQueueItem>, nowMs: number): PlicaQueueSummary {
  const ages = items
    .filter((item) => item.bucket !== "later")
    .map((item) => queueItemAgeMinutes(item, nowMs))
    .filter((mins): mins is number => mins !== null);
  return {
    now: items.filter((item) => item.bucket === "now").length,
    soon: items.filter((item) => item.bucket === "soon").length,
    later: items.filter((item) => item.bucket === "later").length,
    total: items.length,
    oldestMins: ages.length ? Math.max(...ages) : null,
  };
}

export type PlicaQueueGrouping = "severity" | "company" | "kind" | "project" | "age";

export const PLICA_QUEUE_GROUPINGS: ReadonlyArray<{ grouping: PlicaQueueGrouping; label: string }> = [
  { grouping: "severity", label: "Severity" },
  { grouping: "company", label: "Company" },
  { grouping: "kind", label: "Kind" },
  { grouping: "project", label: "Project" },
  { grouping: "age", label: "Age" },
];

export const PLICA_QUEUE_GROUPING_STORAGE_KEY = "plica.queueGrouping";

export function normalizeQueueGrouping(value: string | null | undefined): PlicaQueueGrouping {
  return PLICA_QUEUE_GROUPINGS.some((entry) => entry.grouping === value) ? (value as PlicaQueueGrouping) : "severity";
}

/** What sort of ask an item is — the "Kind" grouping and the row glyph. */
export type PlicaQueueKind =
  | "questions"
  | "confirmations"
  | "approvals"
  | "blockers"
  | "failed"
  | "heartbeats"
  | "routines"
  | "other";

const KIND_ORDER: ReadonlyArray<{ kind: PlicaQueueKind; label: string }> = [
  { kind: "questions", label: "Questions" },
  { kind: "confirmations", label: "Confirmations" },
  { kind: "approvals", label: "Approvals" },
  { kind: "heartbeats", label: "Heartbeats" },
  { kind: "failed", label: "Failed runs" },
  { kind: "routines", label: "Routines" },
  { kind: "blockers", label: "Blockers" },
  { kind: "other", label: "Other" },
];

export function queueItemKind(item: PlicaQueueItem): PlicaQueueKind {
  switch (item.kind) {
    case "approval":
      return "approvals";
    case "heartbeat":
      return "heartbeats";
    case "routine":
      return "routines";
    default: {
      const source = item.item.sourceKind;
      if (source === "issue_thread_interaction") {
        const kind = item.item.subject.metadata?.kind;
        return kind === "ask_user_questions" ? "questions" : "confirmations";
      }
      if (source === "blocker_attention") return "blockers";
      if (source === "failed_run" || source === "agent_error_alert") return "failed";
      return "other";
    }
  }
}

/** Age buckets for the "Age" grouping and the colour ramp on the age label. */
export type PlicaQueueAge = "today" | "week" | "older" | "stale";

const AGE_ORDER: ReadonlyArray<{ age: PlicaQueueAge; label: string }> = [
  { age: "stale", label: "Stale · 30d+" },
  { age: "older", label: "Older than a week" },
  { age: "week", label: "This week" },
  { age: "today", label: "Today" },
];

export function queueItemAge(item: PlicaQueueItem, nowMs: number): PlicaQueueAge {
  const minutes = queueItemAgeMinutes(item, nowMs);
  if (minutes === null) return "today";
  if (minutes >= 30 * 24 * 60) return "stale";
  if (minutes >= 7 * 24 * 60) return "older";
  if (minutes >= 24 * 60) return "week";
  return "today";
}

/** Grey until a week, amber to a month, red after — the ramp on the age label. */
export function ageTone(minutes: number | null): "fresh" | "aging" | "stale" {
  if (minutes === null || minutes < 7 * 24 * 60) return "fresh";
  return minutes >= 30 * 24 * 60 ? "stale" : "aging";
}

export interface PlicaQueueGroup {
  key: string;
  label: string;
  bucket: PlicaQueueBucket | null;
  company: Company | null;
  items: PlicaQueueItem[];
}

/**
 * Severity grouping = the three buckets (empty ones omitted). Company grouping
 * keeps the given company order — the page passes its hot-first/manual order —
 * and omits companies with nothing in the queue. Items inside a group are
 * always in compareQueueItems order.
 */
export function groupQueue(
  items: ReadonlyArray<PlicaQueueItem>,
  grouping: PlicaQueueGrouping,
  companies: ReadonlyArray<Company>,
  context: { projects?: ReadonlyArray<Project>; nowMs?: number } = {},
): PlicaQueueGroup[] {
  const sorted = [...items].sort(compareQueueItems);
  const groupsOf = <K extends string>(
    order: ReadonlyArray<{ key: K; label: string }>,
    keyOf: (item: PlicaQueueItem) => K,
  ): PlicaQueueGroup[] =>
    order
      .map(({ key, label }) => ({
        key,
        label,
        bucket: null,
        company: null,
        items: sorted.filter((item) => keyOf(item) === key),
      }))
      .filter((group) => group.items.length > 0);

  switch (grouping) {
    case "company":
      return companies
        .map((company) => ({
          key: company.id,
          label: company.name,
          bucket: null,
          company,
          items: sorted.filter((item) => item.companyId === company.id),
        }))
        .filter((group) => group.items.length > 0);
    case "kind":
      return groupsOf(KIND_ORDER.map(({ kind, label }) => ({ key: kind, label })), queueItemKind);
    case "age": {
      const nowMs = context.nowMs ?? Date.now();
      return groupsOf(AGE_ORDER.map(({ age, label }) => ({ key: age, label })), (item) => queueItemAge(item, nowMs));
    }
    case "project": {
      // Projects in the order they first appear in the sorted queue, so the
      // project holding the most urgent item leads; no-project items last.
      const projectName = new Map((context.projects ?? []).map((project) => [project.id, project.name]));
      const projectOf = (item: PlicaQueueItem): string =>
        item.kind === "attention" && item.issue?.projectId ? item.issue.projectId : "";
      const order: Array<{ key: string; label: string }> = [];
      for (const item of sorted) {
        const key = projectOf(item);
        if (key && !order.some((entry) => entry.key === key)) {
          order.push({ key, label: projectName.get(key) ?? "Project" });
        }
      }
      order.push({ key: "", label: "No project" });
      return groupsOf(order, projectOf);
    }
    case "severity":
    default:
      return PLICA_QUEUE_BUCKETS.map(({ bucket, label }) => ({
        key: bucket,
        label,
        bucket,
        company: null,
        items: sorted.filter((item) => item.bucket === bucket),
      })).filter((group) => group.items.length > 0);
  }
}

// ---------------------------------------------------------------------------
// Cross-company live runs and upcoming routines (the two lists under the board)
// ---------------------------------------------------------------------------

export interface PlicaLiveEntry {
  company: Company;
  run: LiveRunForIssue;
  issue: Issue | undefined;
  startedMs: number;
  /** Working = an agent is on it; queued = waiting for a runner. */
  phase: RunPhase;
}

/**
 * Every queued/running run across companies. Runs actually being worked come
 * first (longest-running first), then the queue behind them (longest-waiting
 * first) — a run waiting on a runner is a different thing to look at than a
 * run burning time on a ticket, so the two never interleave.
 */
export function flattenLiveRuns(
  entries: ReadonlyArray<{ company: Company; runs: ReadonlyArray<LiveRunForIssue>; issues: ReadonlyArray<Issue> }>,
): PlicaLiveEntry[] {
  const out: PlicaLiveEntry[] = [];
  for (const { company, runs, issues } of entries) {
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    for (const run of runs) {
      if (!isRunActive(run)) continue;
      out.push({
        company,
        run,
        issue: run.issueId ? issueById.get(run.issueId) : undefined,
        startedMs: epochMs(run.startedAt ?? run.createdAt) ?? 0,
        phase: runPhase(run),
      });
    }
  }
  return out.sort(
    (a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || a.startedMs - b.startedMs,
  );
}

export interface PlicaUpcomingRoutine {
  company: Company;
  routine: RoutineListItem;
  /** The enabled trigger that fires soonest. */
  trigger: RoutineListItem["triggers"][number];
  /** When it fires (epoch ms). */
  atMs: number;
  state: "overdue" | "failed" | "scheduled";
}

/**
 * One line per active routine with an enabled, scheduled trigger: the ones
 * that are late first (latest-overdue at the top), then everything else by
 * soonest. A routine whose last run failed keeps its place in time but is
 * marked, so the failure is visible without pushing it above things that are
 * actually late.
 */
export function upcomingRoutines(
  entries: ReadonlyArray<{ company: Company; routines: ReadonlyArray<RoutineListItem> }>,
  nowMs: number,
): PlicaUpcomingRoutine[] {
  const out: PlicaUpcomingRoutine[] = [];
  for (const { company, routines } of entries) {
    for (const routine of routines) {
      if (routine.status !== "active") continue;
      const soonest = (routine.triggers ?? [])
        .filter((trigger) => trigger.enabled && trigger.nextRunAt)
        .map((trigger) => ({ trigger, atMs: epochMs(trigger.nextRunAt as unknown as string) }))
        .filter((entry): entry is { trigger: typeof entry.trigger; atMs: number } => entry.atMs !== null)
        .sort((a, b) => a.atMs - b.atMs)[0];
      if (!soonest) continue;
      const { trigger, atMs } = soonest;
      const state: PlicaUpcomingRoutine["state"] =
        atMs < nowMs - PLICA_ROUTINE_OVERDUE_GRACE_MS
          ? "overdue"
          : routine.lastRun?.status === "failed"
            ? "failed"
            : "scheduled";
      out.push({ company, routine, trigger, atMs, state });
    }
  }
  // Calendar order, Sunday through Saturday, then time of day — the rail reads
  // like a week's schedule rather than a countdown queue. Urgency has not been
  // lost: it moved into each row's colour and each company's summary line.
  out.sort((a, b) => {
    const aAt = new Date(a.atMs);
    const bAt = new Date(b.atMs);
    return (
      aAt.getDay() - bAt.getDay() ||
      aAt.getHours() * 60 + aAt.getMinutes() - (bAt.getHours() * 60 + bAt.getMinutes()) ||
      a.routine.title.localeCompare(b.routine.title)
    );
  });
  return out;
}

// ---------------------------------------------------------------------------
// Cron → cadence
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A wall-clock time the way the reader's locale writes one — "9:00 AM" rather
 * than the cron's own "09:00". The date is a throwaway carrier for the time.
 */
function clock(hour: number, minute: number): string {
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dayList(field: string): string | null {
  if (field === "1-5") return "weekdays";
  if (field === "0,6" || field === "6,0") return "weekends";
  const days = field.split(",").map((part) => Number(part));
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 7)) return null;
  return days.map((day) => DAY_NAMES[day % 7]).join(", ");
}

/**
 * The common cron shapes in plain words — "daily 8:00 AM", "weekdays 9:30 AM",
 * "every 30m", "Mon 7:00 AM". Anything fancier returns null and the caller
 * falls back to the trigger's own label or the raw expression.
 */
export function describeCron(expression: string | null | undefined): string | null {
  if (!expression) return null;
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  const every = (field: string) => (field.startsWith("*/") ? Number(field.slice(2)) : null);
  const num = (field: string) => (/^\d+$/.test(field) ? Number(field) : null);

  if (dom === "*" && mon === "*") {
    const everyMin = every(min);
    if (everyMin && hour === "*" && dow === "*") return `every ${everyMin}m`;
    const everyHour = every(hour);
    const minute = num(min);
    if (everyHour && minute !== null && dow === "*") return everyHour === 1 ? "hourly" : `every ${everyHour}h`;
    if (min === "*" && hour === "*" && dow === "*") return "every minute";
    if (hour === "*" && minute !== null && dow === "*") return "hourly";
    const hourNum = num(hour);
    if (minute !== null && hourNum !== null) {
      const time = clock(hourNum, minute);
      if (dow === "*") return `daily ${time}`;
      const days = dayList(dow);
      if (days) return `${days} ${time}`;
    }
  }
  if (mon === "*" && dow === "*") {
    const minute = num(min);
    const hourNum = num(hour);
    const day = num(dom);
    if (minute !== null && hourNum !== null && day !== null) return `monthly on the ${day} at ${clock(hourNum, minute)}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cross-company projects (the third list on the left)
// ---------------------------------------------------------------------------

export interface PlicaProjectEntry {
  company: Company;
  project: Project;
  open: number;
  inProgress: number;
  blocked: number;
  /** Target date at local midnight (epoch ms), or null when the project has none. */
  dueMs: number | null;
  overdue: boolean;
}

function targetDateMs(targetDate: string | null): number | null {
  if (!targetDate) return null;
  // Date-only strings parse as UTC midnight; anchor to local midnight so
  // "due today" is today in the viewer's timezone.
  const [year, month, day] = targetDate.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
}

/**
 * Every unarchived project with open work, across companies: nearest target
 * date first (overdue leading), undated ones after by open count. Paused /
 * completed projects are skipped — they are not "what's in flight".
 */
export function upcomingProjects(
  entries: ReadonlyArray<{ company: Company; projects: ReadonlyArray<Project>; issues: ReadonlyArray<Issue> }>,
  nowMs: number,
): PlicaProjectEntry[] {
  const all: PlicaProjectEntry[] = [];
  for (const { company, projects, issues } of entries) {
    const counts = new Map<string, { open: number; inProgress: number; blocked: number }>();
    for (const issue of issues) {
      if (!issue.projectId || issue.status === "done" || issue.status === "cancelled") continue;
      const count = counts.get(issue.projectId) ?? { open: 0, inProgress: 0, blocked: 0 };
      count.open += 1;
      if (issue.status === "in_progress" || issue.status === "in_review") count.inProgress += 1;
      if (issue.status === "blocked") count.blocked += 1;
      counts.set(issue.projectId, count);
    }
    for (const project of projects) {
      if (project.archivedAt || project.status === "completed" || project.status === "cancelled") continue;
      const count = counts.get(project.id);
      if (!count) continue;
      const dueMs = targetDateMs(project.targetDate);
      all.push({ company, project, ...count, dueMs, overdue: dueMs !== null && dueMs < nowMs });
    }
  }
  all.sort((a, b) => {
    if (a.dueMs !== null && b.dueMs !== null && a.dueMs !== b.dueMs) return a.dueMs - b.dueMs;
    if ((a.dueMs === null) !== (b.dueMs === null)) return a.dueMs === null ? 1 : -1;
    return b.open - a.open || a.project.name.localeCompare(b.project.name);
  });
  return all;
}


/**
 * One group per company.
 *
 * `order` is the board's own company order — watched first, then hot-first or
 * the user's sidebar order — and the rails follow it so the same company sits
 * in the same place in every list on the page. Without it the rails would
 * order themselves by whichever company happened to hold the most urgent item,
 * and the three lists would disagree with the board and with each other.
 *
 * Companies absent from `order` keep their first-appearance position at the
 * end rather than being dropped.
 */
export interface PlicaCompanyGroup<T> {
  company: Company;
  items: T[];
}

export function groupByCompany<T extends { company: Company }>(
  items: ReadonlyArray<T>,
  order: ReadonlyArray<Company> = [],
): PlicaCompanyGroup<T>[] {
  const groups = new Map<string, PlicaCompanyGroup<T>>();
  for (const item of items) {
    const group = groups.get(item.company.id);
    if (group) group.items.push(item);
    else groups.set(item.company.id, { company: item.company, items: [item] });
  }
  const rank = new Map(order.map((company, index) => [company.id, index]));
  return [...groups.values()].sort(
    (a, b) => (rank.get(a.company.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.company.id) ?? Number.MAX_SAFE_INTEGER),
  );
}


// ---------------------------------------------------------------------------
// Routine cycle heat
// ---------------------------------------------------------------------------

/** A routine is "live" for the hour after it fires. */
export const PLICA_ROUTINE_LIVE_MS = 60 * 60_000;
/** How far out a routine starts warming toward live. */
export const PLICA_ROUTINE_APPROACH_MS = 24 * 60 * 60_000;
/** Approaching never quite reaches live, so a running routine still stands out. */
const APPROACH_CEILING = 0.85;

export type PlicaRoutinePhase = "running" | "overdue" | "approaching" | "resting";

export interface PlicaRoutineHeat {
  phase: PlicaRoutinePhase;
  /** 0 = at rest (muted grey), 1 = live. Drives the row's colour mix. */
  intensity: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Where a routine sits in its own cycle, as a single 0–1 number.
 *
 * The rail colours every row by this, so the *shape* of the week is visible
 * before any text is read: rows brighten toward live blue over the day before
 * they fire, burn full blue for the hour they run, then drop straight back to
 * muted grey.
 *
 * The drop is deliberately hard rather than a fade. A routine that has just
 * finished is finished — how it *went* is carried by its outcome mark, which
 * is a fact rather than a temperature, and a lingering glow would compete
 * with the rows that are genuinely about to fire.
 */
export function routineHeat(input: {
  nextAtMs: number | null;
  lastFiredAtMs: number | null;
  nowMs: number;
}): PlicaRoutineHeat {
  const { nextAtMs, lastFiredAtMs, nowMs } = input;

  const sinceFired = lastFiredAtMs === null ? null : nowMs - lastFiredAtMs;
  if (sinceFired !== null && sinceFired >= 0 && sinceFired < PLICA_ROUTINE_LIVE_MS) {
    return { phase: "running", intensity: 1 };
  }

  const untilNext = nextAtMs === null ? null : nextAtMs - nowMs;
  // A schedule that should already have fired is the loudest thing this rail
  // reports. Without this it scores as "resting" — the dimmest row on screen —
  // because its next run is in the past and nothing is approaching.
  if (untilNext !== null && untilNext < -PLICA_ROUTINE_OVERDUE_GRACE_MS) {
    return { phase: "overdue", intensity: 1 };
  }
  const approaching = untilNext !== null && untilNext >= 0 && untilNext < PLICA_ROUTINE_APPROACH_MS
    ? clamp01(1 - untilNext / PLICA_ROUTINE_APPROACH_MS) * APPROACH_CEILING
    : 0;

  return approaching === 0 ? { phase: "resting", intensity: 0 } : { phase: "approaching", intensity: approaching };
}

// ---------------------------------------------------------------------------
// Routine outcome
// ---------------------------------------------------------------------------

/**
 * How the routine's last run ended, as one mark the rail can render.
 *
 * `ok` is the quiet, colourless case — a tick and nothing more. The rest are
 * reasons to look, and each carries the issue to open so the mark is a way in
 * rather than just a verdict.
 */
export type PlicaRoutineOutcomeState = "ok" | "failed" | "blocked" | "working" | "skipped" | "never";

/**
 * The issue fields the outcome mark needs. Declared structurally because
 * `RoutineIssueSummary` is not re-exported from the shared package index;
 * this is the subset both `lastRun.linkedIssue` and `activeIssue` carry.
 */
export interface PlicaOutcomeIssue {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
}

export interface PlicaRoutineOutcome {
  state: PlicaRoutineOutcomeState;
  /** Plain-language reading, used as the mark's tooltip. */
  label: string;
  /** The issue the run produced or stalled on, when there is one to open. */
  issue: PlicaOutcomeIssue | null;
}

const CLOSED = new Set(["done", "cancelled"]);

export function routineOutcome(routine: RoutineListItem): PlicaRoutineOutcome {
  const run = routine.lastRun;
  // The run's own linked issue first; `activeIssue` is the routine's current
  // one, which is the right fallback when the run only recorded an id.
  const issue = run?.linkedIssue ?? routine.activeIssue ?? null;
  if (!run) return { state: "never", label: "has not run yet", issue: null };

  switch (run.status) {
    case "failed":
      return {
        state: "failed",
        label: run.failureReason?.trim() ? `last run failed — ${run.failureReason.trim()}` : "last run failed",
        issue,
      };
    case "skipped":
    case "coalesced":
      return { state: "skipped", label: `last run ${run.status}`, issue };
    case "received":
      return { state: "working", label: "run received, not finished yet", issue };
    case "issue_created":
    case "completed":
    default: {
      if (issue && issue.status === "blocked") {
        return { state: "blocked", label: `blocked on ${issue.identifier ?? issue.title}`, issue };
      }
      if (run.status === "completed" || (issue && CLOSED.has(issue.status))) {
        return { state: "ok", label: "last run completed", issue };
      }
      return {
        state: "working",
        label: issue ? `working on ${issue.identifier ?? issue.title}` : "run in progress",
        issue,
      };
    }
  }
}


/**
 * The cadence with no day in it: a clock time, or an interval.
 *
 * The rail already has a weekday column, so this column must never also talk
 * about days — otherwise some rows read "Mon 9:00 AM" and others "9:00 AM"
 * and the column means two different things down its own length. Every row
 * answers exactly one question here: at what time, or how often.
 */
export function describeCronClock(expression: string | null | undefined): string | null {
  if (!expression) return null;
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour] = parts;
  const every = (field: string) => (field.startsWith("*/") ? Number(field.slice(2)) : null);
  const num = (field: string) => (/^\d+$/.test(field) ? Number(field) : null);

  const everyMin = every(min);
  if (everyMin && hour === "*") return `every ${everyMin}m`;
  const everyHour = every(hour);
  if (everyHour) return everyHour === 1 ? "hourly" : `every ${everyHour}h`;
  // `* * * * *` is every minute, not hourly — only a fixed minute past each
  // hour is hourly.
  if (hour === "*") return min === "*" ? "every minute" : "hourly";

  const minute = num(min);
  const hourNum = num(hour);
  return minute !== null && hourNum !== null ? clock(hourNum, minute) : null;
}

/**
 * A trigger label worth showing beside the routine's own title.
 *
 * Trigger labels are often prose restating the routine ("Series release" under
 * "Series Content Release"), which reads as the row saying the same thing
 * twice. Only a label that adds something survives.
 */
export function distinctLabel(label: string | null | undefined, title: string): string | null {
  const text = label?.trim();
  if (!text) return null;
  const words = (value: string) =>
    new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const a = words(text);
  const b = words(title);
  if (a.size === 0) return null;
  // Word-subset, not substring: "Series release" is not a substring of
  // "Series Content Release" but says nothing the title has not already said.
  const subset = (small: Set<string>, large: Set<string>) => [...small].every((word) => large.has(word));
  return subset(a, b) || subset(b, a) ? null : text;
}

