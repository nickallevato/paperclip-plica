import { CalendarClock } from "lucide-react";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";
import { formatAgeMinutes, formatCountdown } from "../lib/plica";
import { describeCron, type PlicaUpcomingRoutine } from "../lib/queue";
import { PlicaLink } from "./PlicaLink";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

/**
 * What fires next, across companies — overdue routines first because a
 * schedule that stopped is the one failure nothing else on the board reports.
 */
export function PlicaRoutinesList({
  items,
  overflow,
  nowMs,
}: {
  items: PlicaUpcomingRoutine[];
  overflow: number;
  nowMs: number;
}) {
  return (
    <section data-plica-routines className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3">
      <h3 className={`flex items-center gap-2 ${MICRO} font-semibold uppercase tracking-wide text-muted-foreground`}>
        <CalendarClock className="h-3 w-3" />
        Next up · routines
      </h3>
      {items.length === 0 ? (
        <p className={`${MICRO} italic text-muted-foreground`}>nothing scheduled</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(({ company, routine, trigger, atMs, state }) => {
            // Cadence in words when the cron is a shape we can read; the
            // trigger's own label (often prose) stays as the tooltip.
            const label = trigger.label?.trim() || null;
            const cadence = describeCron(trigger.cronExpression) ?? label ?? trigger.cronExpression ?? trigger.kind;
            const atIso = new Date(atMs).toISOString();
            return (
              <li
                key={`${company.id}:${routine.id}`}
                className="flex items-center gap-2.5 py-0.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45]"
              >
                <CompanyPatternIcon
                  companyName={company.name}
                  logoUrl={company.logoUrl}
                  brandColor={company.brandColor}
                  className="size-5 shrink-0 rounded-md text-[8px]"
                />
                <PlicaLink
                  to={`/${company.issuePrefix}/routines/${routine.id}`}
                  companyId={company.id}
                  className="w-52 shrink-0 truncate font-medium hover:underline decoration-dotted underline-offset-2"
                  title={`${routine.title} · ${company.name}`}
                >
                  {routine.title}
                </PlicaLink>
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={label ?? undefined}>
                  {cadence}
                  {state === "failed" && <span className="text-red-600 dark:text-red-400"> · last run failed</span>}
                </span>
                <span
                  className={cn(
                    MICRO,
                    "shrink-0 tabular-nums",
                    state === "overdue" ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                  )}
                  title={new Date(atMs).toLocaleString()}
                >
                  {state === "overdue"
                    ? `overdue ${formatAgeMinutes(Math.round((nowMs - atMs) / 60_000))}`
                    : formatCountdown(atIso, nowMs)}
                </span>
              </li>
            );
          })}
          {overflow > 0 && <li className={`${MICRO} text-muted-foreground`}>+{overflow} more</li>}
        </ul>
      )}
    </section>
  );
}
