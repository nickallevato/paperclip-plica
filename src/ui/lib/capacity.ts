import type { Agent } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../host/api";
import { runPhase } from "./runs";

/**
 * How long a run may go without saying anything before the board treats it as
 * stalled rather than working. A run that holds a runner but reports nothing
 * is the failure mode a glance-level dashboard exists to catch, and it is
 * invisible in a bare "3 running" count.
 */
export const PLICA_STALL_MS = 20 * 60_000;

/**
 * One square in a company's capacity strip.
 *
 * `working` and `queued` mirror {@link runPhase}; `stalled` is a working run
 * that has gone quiet; `error` is an agent the host has marked failed; `idle`
 * is an agent that is staffed with nothing on it. The distinction between
 * `idle` and *no agent at all* is the whole point — "0 / 4" renders those two
 * states identically today.
 */
export type PlicaSquareState = "working" | "stalled" | "queued" | "error" | "idle";

export interface PlicaSquare {
  agentId: string;
  agentName: string;
  state: PlicaSquareState;
  /** The run behind a working/stalled/queued square, when there is one. */
  run: LiveRunForIssue | null;
  /** Minutes since the run last did anything useful — only set when stalled. */
  silentMins: number | null;
}

/**
 * Agents that are not capacity and must not occupy a square.
 *
 * `paused` and `terminated` cannot pick up work, and `pending_approval` has
 * not been hired yet — drawing any of them as an idle square would claim the
 * company has staff standing by when it does not.
 */
const NOT_CAPACITY = new Set(["paused", "terminated", "pending_approval"]);

/** The most alarming state wins when one agent somehow has several runs. */
const RANK: Record<PlicaSquareState, number> = { error: 0, stalled: 1, working: 2, queued: 3, idle: 4 };

/**
 * The last moment a run demonstrably did something.
 *
 * Any genuine sign of life counts — a useful action, an event, a status
 * update — so the most recent of those three wins; a long tool call that keeps
 * emitting events is working, not stalled. `startedAt` is only a fallback for
 * a run that has reported nothing at all, and deliberately does not compete
 * with the activity signals: a run whose last useful action is older than its
 * own start timestamp is inconsistent data, and the older signal is the
 * conservative read.
 */
function lastSignAtMs(run: LiveRunForIssue): number | null {
  const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Number.NaN);
  const activity = [run.lastUsefulActionAt, run.lastEventAt, run.currentStatusUpdatedAt]
    .map(ms)
    .filter((value) => Number.isFinite(value));
  if (activity.length) return Math.max(...activity);
  const started = ms(run.startedAt);
  return Number.isFinite(started) ? started : null;
}

function stateForRun(run: LiveRunForIssue, nowMs: number): { state: PlicaSquareState; silentMins: number | null } {
  if (runPhase(run) === "queued") return { state: "queued", silentMins: null };
  const lastSign = lastSignAtMs(run);
  if (lastSign === null) return { state: "working", silentMins: null };
  const silentMs = nowMs - lastSign;
  if (silentMs >= PLICA_STALL_MS) return { state: "stalled", silentMins: Math.round(silentMs / 60_000) };
  return { state: "working", silentMins: null };
}


/**
 * Agents in org order: the CEO first, then each agent immediately followed by
 * the people who report to them, depth first.
 *
 * Reading the strip left to right therefore walks the org chart, so the first
 * square is always the company's top-level agent and a manager sits beside
 * their own reports. Siblings are sorted by name (ties by id) so the order is
 * stable across polls — the strip must only ever change when the org does,
 * never because a fetch came back in a different order.
 *
 * Anyone whose manager is missing from `agents` — filtered out as
 * non-capacity, or simply not loaded — is treated as top level rather than
 * dropped, so the strip never silently loses a working agent.
 */
function orgOrder(agents: ReadonlyArray<Agent>): Agent[] {
  const present = new Set(agents.map((agent) => agent.id));
  const reportsByManager = new Map<string, Agent[]>();
  for (const agent of agents) {
    const manager = agent.reportsTo && present.has(agent.reportsTo) && agent.reportsTo !== agent.id
      ? agent.reportsTo
      : "";
    const siblings = reportsByManager.get(manager);
    if (siblings) siblings.push(agent);
    else reportsByManager.set(manager, [agent]);
  }
  for (const siblings of reportsByManager.values()) {
    siblings.sort((a, b) => {
      // The chief sits first among equals whatever they are called.
      if ((a.role === "ceo") !== (b.role === "ceo")) return a.role === "ceo" ? -1 : 1;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  }

  const ordered: Agent[] = [];
  const seen = new Set<string>();
  // Iterative, and guarded by `seen`: a reportsTo cycle must not hang the HUD.
  const walk = (agent: Agent) => {
    if (seen.has(agent.id)) return;
    seen.add(agent.id);
    ordered.push(agent);
    for (const report of reportsByManager.get(agent.id) ?? []) walk(report);
  };
  for (const root of reportsByManager.get("") ?? []) walk(root);
  // Anything left is inside a reporting cycle; append it rather than lose it.
  for (const agent of agents) if (!seen.has(agent.id)) ordered.push(agent);
  return ordered;
}

/**
 * One square per agent in org order (see {@link orgOrder}): the top-level
 * agent first, each manager followed by their reports. Stable across polls —
 * only the squares' states change. Agents that cannot take work are dropped
 * rather than drawn idle, which would overstate the company's capacity.
 */
export function deriveCapacity(
  agents: ReadonlyArray<Agent>,
  liveRuns: ReadonlyArray<LiveRunForIssue>,
  nowMs: number,
): PlicaSquare[] {
  const runsByAgent = new Map<string, LiveRunForIssue[]>();
  for (const run of liveRuns) {
    const list = runsByAgent.get(run.agentId);
    if (list) list.push(run);
    else runsByAgent.set(run.agentId, [run]);
  }

  return orgOrder(agents.filter((agent) => !NOT_CAPACITY.has(agent.status)))
    .map((agent) => {
      if (agent.status === "error") {
        return { agentId: agent.id, agentName: agent.name, state: "error" as const, run: null, silentMins: null };
      }
      const runs = runsByAgent.get(agent.id) ?? [];
      if (runs.length === 0) {
        return { agentId: agent.id, agentName: agent.name, state: "idle" as const, run: null, silentMins: null };
      }
      const scored = runs
        .map((run) => ({ run, ...stateForRun(run, nowMs) }))
        .sort((a, b) => RANK[a.state] - RANK[b.state]);
      const best = scored[0];
      return { agentId: agent.id, agentName: agent.name, state: best.state, run: best.run, silentMins: best.silentMins };
    });
}

export interface PlicaCapacityCounts {
  working: number;
  stalled: number;
  queued: number;
  error: number;
  idle: number;
  total: number;
}

export function countCapacity(squares: ReadonlyArray<PlicaSquare>): PlicaCapacityCounts {
  const counts: PlicaCapacityCounts = { working: 0, stalled: 0, queued: 0, error: 0, idle: 0, total: squares.length };
  for (const square of squares) counts[square.state] += 1;
  return counts;
}

/**
 * The parts of an agent worth reading on hover.
 *
 * Everything here is dug out of `adapterConfig` / `runtimeConfig`, which are
 * loosely typed `Record<string, unknown>` on this codebase generation — so
 * each field is narrowed defensively and simply goes missing rather than
 * throwing when a company's agents are configured differently.
 */
export interface PlicaAgentProfile {
  name: string;
  /** Job title, falling back to the role. */
  title: string | null;
  model: string | null;
  /** Reasoning effort or adapter variant, when set. */
  effort: string | null;
  maxConcurrentRuns: number | null;
  maxTurnsPerRun: number | null;
  /** Heartbeat cadence in seconds, or null when heartbeat is off. */
  heartbeatSec: number | null;
  /** Skill names, already trimmed of their `owner/repo/` prefix. */
  skills: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** `paperclipai/paperclip/paperclip-board` reads as `paperclip-board`. */
function skillName(ref: string): string {
  const parts = ref.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? ref;
}

export function agentProfile(agent: Agent): PlicaAgentProfile {
  const adapter = record(agent.adapterConfig) ?? {};
  const runtime = record(agent.runtimeConfig) ?? {};
  const heartbeat = record(runtime.heartbeat) ?? {};
  const skillSync = record(adapter.paperclipSkillSync) ?? {};
  const desired = Array.isArray(skillSync.desiredSkills) ? skillSync.desiredSkills : [];

  return {
    name: agent.name,
    title: text(agent.title) ?? text(agent.role),
    model: text(adapter.model),
    effort: text(adapter.modelReasoningEffort) ?? text(adapter.effort) ?? text(adapter.variant),
    maxConcurrentRuns: positive(heartbeat.maxConcurrentRuns),
    maxTurnsPerRun: positive(adapter.maxTurnsPerRun),
    heartbeatSec: heartbeat.enabled === true ? positive(heartbeat.intervalSec) : null,
    skills: desired.filter((ref): ref is string => typeof ref === "string").map(skillName),
  };
}
