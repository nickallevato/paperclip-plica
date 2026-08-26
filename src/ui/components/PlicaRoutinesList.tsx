import { AlertTriangle, CalendarClock, Check, CircleSlash, Minus, Timer } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import { formatAgeMinutes, formatCountdown } from "../lib/plica";
import {
  describeCronClock,
  distinctLabel,
  groupByCompany,
  routineHeat,
  routineOutcome,
  type PlicaRoutineOutcomeState,
  type PlicaUpcomingRoutine,
} from "../lib/queue";
import { PlicaCompanyGroup } from "./PlicaCompanyGroup";
import { PlicaLink } from "./PlicaLink";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * How the last run ended, as one mark.
 *
 * A clean run is colourless — a tick the eye can skip. Only the outcomes that
 * want something from you take a colour, which is the same discipline the
 * board columns follow.
 */
const OUTCOME_ICON: Record<PlicaRoutineOutcomeState, typeof Check | null> = {
  ok: Check,
  failed: AlertTriangle,
  blocked: CircleSlash,
  working: Timer,
  skipped: Minus,
  never: null,
};

const OUTCOME_TONE: Record<PlicaRoutineOutcomeState, string> = {
  ok: "text-muted-foreground/70",
  failed: "text-plica-alarm",
  blocked: "text-plica-wait",
  working: "text-plica-live",
  skipped: "text-muted-foreground/40",
  never: "text-muted-foreground/40",
};

/**
 * The row's colour, mixed from its place in the cycle: muted grey at rest,
 * warming toward live blue as the run approaches, full blue while live.
 * Inline because the mix is continuous — there is no utility class for 37%.
 */
function heatStyle(intensity: number): { color: string } {
  return { color: `color-mix(in oklab, var(--plica-live) ${Math.round(intensity * 100)}%, var(--plica-rest))` };
}

/** When the trigger last fired, as epoch ms — the anchor for live and afterglow. */
function lastFiredMs(item: PlicaUpcomingRoutine): number | null {
  const raw = item.trigger.lastFiredAt ?? item.routine.lastRun?.triggeredAt ?? null;
  if (!raw) return null;
  const ms = new Date(raw as unknown as string).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** The collapsed reading for one company's routines: what is late, then what is next. */
function summarize(items: PlicaUpcomingRoutine[], nowMs: number): { text: string; tone: "quiet" | "wait" | "alarm" } {
  const overdue = items.filter((item) => item.state === "overdue").length;
  const failed = items.filter((item) => item.state === "failed").length;
  const next = items.find((item) => item.state !== "overdue");
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (next) parts.push(`next ${formatCountdown(new Date(next.atMs).toISOString(), nowMs)}`);
  return {
    text: parts.join(" · ") || "nothing scheduled",
    tone: failed > 0 ? "alarm" : overdue > 0 ? "wait" : "quiet",
  };
}

/**
 * Routines by company, each foldable.
 *
 * Companies keep the order the flat sort gave them — overdue first, then
 * soonest — so the company with the latest schedule still leads the rail.
 * Nothing is capped: a long company is folded, not truncated.
 */
export function PlicaRoutinesList({
  items,
  companies = [],
  nowMs,
}: {
  items: PlicaUpcomingRoutine[];
  /** The board's company order, so the rail sits in the same order as the ledger. */
  companies?: Company[];
  nowMs: number;
}) {
  const groups = groupByCompany(items, companies);
  return (
    <section data-plica-routines className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3">
      <h3 className={`flex items-center gap-2 ${MICRO} font-semibold uppercase tracking-wide text-muted-foreground`}>
        <CalendarClock className="h-3 w-3" />
        Routines
      </h3>
      {items.length === 0 ? (
        <p className={`${MICRO} italic text-muted-foreground`}>nothing scheduled</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {groups.map((group) => {
            const summary = summarize(group.items, nowMs);
            return (
              <PlicaCompanyGroup
                key={group.company.id}
                company={group.company}
                count={group.items.length}
                summary={summary.text}
                tone={summary.tone}
              >
                {group.items.map((item) => {
                  const { company, routine, trigger, atMs, state } = item;
            // Cadence in words when the cron is a shape we can read; the
            // trigger's own label (often prose) stays as the tooltip.
            // The weekday column already says which day; this one says only
            // at what time, or how often — the same question on every row.
            const label = distinctLabel(trigger.label, routine.title);
            const cadence = describeCronClock(trigger.cronExpression) ?? label;
            const heat = routineHeat({ nextAtMs: atMs, lastFiredAtMs: lastFiredMs(item), nowMs });
            const outcome = routineOutcome(routine);
            const OutcomeIcon = OUTCOME_ICON[outcome.state];
            const when = new Date(atMs);
            const weekday = WEEKDAYS[when.getDay()];
            return (
              <li
                key={`${company.id}:${routine.id}`}
                data-routine-phase={heat.phase}
                data-routine-outcome={outcome.state}
                className="flex items-center gap-2 py-0.5 pl-2 text-[length:var(--plica-fs-body,14px)] leading-[1.45]"
                style={heatStyle(heat.intensity)}
              >
                <span className={cn(MICRO, "w-7 shrink-0 text-muted-foreground")}>{weekday}</span>
                <PlicaLink
                  to={`/${company.issuePrefix}/routines/${routine.id}`}
                  companyId={company.id}
                  className="min-w-0 flex-1 truncate hover:underline decoration-dotted underline-offset-2"
                  title={`${routine.title} · ${company.name} · ${heat.phase}`}
                >
                  {routine.title}
                </PlicaLink>
                {cadence && (
                  <span className={cn(MICRO, "shrink-0 tabular-nums opacity-70")} title={trigger.label ?? undefined}>
                    {cadence}
                  </span>
                )}
                {state === "overdue" && (
                  <span className={cn(MICRO, "shrink-0 tabular-nums text-plica-wait")} title={when.toLocaleString()}>
                    overdue {formatAgeMinutes(Math.round((nowMs - atMs) / 60_000))}
                  </span>
                )}
                {OutcomeIcon && (
                  <PlicaLink
                    to={
                      outcome.issue
                        ? `/${company.issuePrefix}/issues/${outcome.issue.identifier ?? outcome.issue.id}`
                        : `/${company.issuePrefix}/routines/${routine.id}`
                    }
                    companyId={company.id}
                    title={
                      outcome.issue
                        ? `${outcome.label} — open ${outcome.issue.identifier ?? outcome.issue.title}`
                        : `${outcome.label} — open the routine`
                    }
                    aria-label={`${routine.title}: ${outcome.label}`}
                    className={cn("shrink-0 rounded p-0.5 hover:bg-muted", OUTCOME_TONE[outcome.state])}
                  >
                    <OutcomeIcon className="h-3.5 w-3.5" />
                  </PlicaLink>
                )}
              </li>
                  );
                })}
              </PlicaCompanyGroup>
            );
          })}
        </ul>
      )}
    </section>
  );
}
