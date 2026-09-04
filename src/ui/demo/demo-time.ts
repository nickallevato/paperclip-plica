/**
 * Relative-time tokens for the demo fixture.
 *
 * A fixture with hardcoded timestamps ages badly: every live run reads "3
 * weeks in progress" and every routine is months overdue, which is exactly
 * the wrong impression for a HUD whose whole point is liveness. So the
 * fixture stores offsets instead of instants and they are resolved once, at
 * load, against the moment the page opened:
 *
 *   "@t:-5m"   → an ISO instant five minutes ago
 *   "@t:+2h"   → two hours from now
 *   "@t:0"     → now
 *   "@d:-3"    → a bare `YYYY-MM-DD` date, three days back
 *
 * Resolved once rather than per request on purpose. Re-resolving would keep
 * an issue's `updatedAt` pinned to a fixed distance from now, so its "12m
 * ago" label would never move — and the running-run elapsed timers would
 * freeze with it. Anchoring at load lets the demo tick forward like the real
 * thing while a screenshot is being lined up.
 */

const INSTANT = /^@t:([+-]?\d+)([smhd])?$/;
const DATE = /^@d:([+-]?\d+)$/;

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Resolve one token, or return null when the string is not a token at all. */
export function resolveTimeToken(value: string, nowMs: number): string | null {
  const instant = INSTANT.exec(value);
  if (instant) {
    const amount = Number(instant[1]);
    const unit = instant[2] ?? "m";
    return new Date(nowMs + amount * UNIT_MS[unit]).toISOString();
  }
  const date = DATE.exec(value);
  if (date) {
    return new Date(nowMs + Number(date[1]) * UNIT_MS.d).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Deep-copy `value`, rewriting every time token it contains.
 *
 * Copies rather than mutating so the loaded fixture is never the same object
 * graph as the parsed JSON — demo writes mutate the store, and a shared graph
 * would let one demo session's approvals leak into the next reload.
 */
export function resolveTimeTokens<T>(value: T, nowMs: number): T {
  if (typeof value === "string") {
    return (resolveTimeToken(value, nowMs) ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveTimeTokens(entry, nowMs)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveTimeTokens(entry, nowMs);
    }
    return out as unknown as T;
  }
  return value;
}
