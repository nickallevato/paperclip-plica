import type {
  Agent,
  Approval,
  AttentionFeed,
  AttentionItem,
  Company,
  Issue,
  RoutineListItem,
} from "@paperclipai/shared";
import type { LiveRunForIssue } from "../host/api";
import {
  PLICA_ROUTINE_OVERDUE_GRACE_MS,
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
  | (PlicaQueueItemBase & { kind: "attention"; item: AttentionItem })
  | (PlicaQueueItemBase & { kind: "heartbeat"; ceo: Agent; beat: PlicaCeoHeartbeat })
  | (PlicaQueueItemBase & { kind: "routine"; routine: RoutineListItem; reason: "overdue" | "failed" });

const BUCKET_ORDER: Record<PlicaQueueBucket, number> = { now: 0, soon: 1, later: 2 };

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
  nowMs: number;
}): PlicaQueueItem[] {
  const items: PlicaQueueItem[] = [];
  const agentName = new Map(input.agents.map((agent) => [agent.id, agent.name]));

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

export type PlicaQueueGrouping = "severity" | "company";

export const PLICA_QUEUE_GROUPING_STORAGE_KEY = "plica.queueGrouping";

export function normalizeQueueGrouping(value: string | null | undefined): PlicaQueueGrouping {
  return value === "company" ? "company" : "severity";
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
): PlicaQueueGroup[] {
  const sorted = [...items].sort(compareQueueItems);
  if (grouping === "company") {
    return companies
      .map((company) => ({
        key: company.id,
        label: company.name,
        bucket: null,
        company,
        items: sorted.filter((item) => item.companyId === company.id),
      }))
      .filter((group) => group.items.length > 0);
  }
  return PLICA_QUEUE_BUCKETS.map(({ bucket, label }) => ({
    key: bucket,
    label,
    bucket,
    company: null,
    items: sorted.filter((item) => item.bucket === bucket),
  })).filter((group) => group.items.length > 0);
}

// ---------------------------------------------------------------------------
// Cross-company live runs and upcoming routines (the two lists under the board)
// ---------------------------------------------------------------------------

export interface PlicaLiveEntry {
  company: Company;
  run: LiveRunForIssue;
  issue: Issue | undefined;
  startedMs: number;
}

/** Every queued/running run across companies, longest-running first. */
export function flattenLiveRuns(
  entries: ReadonlyArray<{ company: Company; runs: ReadonlyArray<LiveRunForIssue>; issues: ReadonlyArray<Issue> }>,
): PlicaLiveEntry[] {
  const out: PlicaLiveEntry[] = [];
  for (const { company, runs, issues } of entries) {
    const issueById = new Map(issues.map((issue) => [issue.id, issue]));
    for (const run of runs) {
      if (run.status !== "queued" && run.status !== "running") continue;
      out.push({
        company,
        run,
        issue: run.issueId ? issueById.get(run.issueId) : undefined,
        startedMs: epochMs(run.startedAt ?? run.createdAt) ?? 0,
      });
    }
  }
  return out.sort((a, b) => a.startedMs - b.startedMs);
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
  limit = 8,
): { items: PlicaUpcomingRoutine[]; overflow: number } {
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
  out.sort((a, b) => {
    const aLate = a.state === "overdue" ? 0 : 1;
    const bLate = b.state === "overdue" ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
    return a.atMs - b.atMs;
  });
  return { items: out.slice(0, limit), overflow: Math.max(0, out.length - limit) };
}

// ---------------------------------------------------------------------------
// Cron → cadence
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function dayList(field: string): string | null {
  if (field === "1-5") return "weekdays";
  if (field === "0,6" || field === "6,0") return "weekends";
  const days = field.split(",").map((part) => Number(part));
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 7)) return null;
  return days.map((day) => DAY_NAMES[day % 7]).join(", ");
}

/**
 * The common cron shapes in plain words — "daily 08:00", "weekdays 09:30",
 * "every 30m", "Mon 07:00". Anything fancier returns null and the caller
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
