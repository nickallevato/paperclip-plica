import { useState } from "react";
import { CalendarClock, ChevronDown, OctagonX, PauseCircle, TimerOff } from "lucide-react";
import type { Company, RoutineListItem } from "@paperclipai/shared";
import { cn } from "../host/util";
import { deriveRoutineHealth, formatCountdown } from "../lib/plica";
import { PlicaLink } from "./PlicaLink";

/**
 * A company's schedule, in one line.
 *
 * Routines are the one part of a company that fails *silently*. A routine that
 * should have fired an hour ago produces no attention item, no failed run and
 * no badge — it simply stops happening, and nothing else in Plica would say
 * so. This strip exists mainly to make that visible; the countdown to the next
 * run is the reassuring half of the same reading.
 */
export function PlicaRoutinesStrip({
  routines,
  company,
  nowMs,
}: {
  routines: RoutineListItem[];
  company: Company;
  nowMs: number;
}) {
  const [open, setOpen] = useState(false);
  const health = deriveRoutineHealth(routines, nowMs);
  if (health.total === 0) return null;

  const troubled = health.overdue > 0 || health.failing > 0;
  const upcoming = routines
    .filter((routine) => routine.status === "active")
    .flatMap((routine) =>
      (routine.triggers ?? [])
        .filter((trigger) => trigger.enabled && trigger.nextRunAt)
        .map((trigger) => ({ routine, at: new Date(trigger.nextRunAt as unknown as string).getTime() })),
    )
    .sort((a, b) => a.at - b.at)
    .slice(0, 5);

  return (
    <div data-routines={company.id}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[length:var(--plica-fs-micro,11px)] leading-[1.45] hover:bg-muted/40",
          troubled && "text-amber-700 dark:text-amber-300",
        )}
      >
        <CalendarClock className="h-3 w-3 shrink-0" />
        <span className="shrink-0 font-medium uppercase tracking-wide">Routines</span>
        <span className="shrink-0 tabular-nums font-semibold">{health.active}</span>
        {health.paused > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground" title={`${health.paused} paused`}>
            <PauseCircle className="h-2.5 w-2.5" />
            {health.paused}
          </span>
        )}
        {health.overdue > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-amber-500/15 px-1 font-semibold text-amber-700 dark:text-amber-300"
            title={`${health.overdue} scheduled run${health.overdue === 1 ? "" : "s"} is overdue`}
          >
            <TimerOff className="h-2.5 w-2.5" />
            {health.overdue} overdue
          </span>
        )}
        {health.failing > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-red-500/15 px-1 font-semibold text-red-700 dark:text-red-300"
            title={`${health.failing} routine${health.failing === 1 ? "" : "s"} last run failed`}
          >
            <OctagonX className="h-2.5 w-2.5" />
            {health.failing} failed
          </span>
        )}
        <span className="ml-auto shrink-0 truncate text-muted-foreground" title={health.nextTitle ?? undefined}>
          {health.nextRunAt ? `next ${formatCountdown(health.nextRunAt, nowMs)}` : "none scheduled"}
        </span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="space-y-0.5 pl-4 pt-0.5">
          {upcoming.length === 0 ? (
            <li className="px-1.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
              Nothing scheduled — every trigger is disabled or unscheduled.
            </li>
          ) : (
            upcoming.map(({ routine, at }) => {
              const late = at < nowMs;
              return (
                <li key={`${routine.id}-${at}`}>
                  <PlicaLink
                    to={`/${company.issuePrefix}/routines/${routine.id}`}
                    companyId={company.id}
                    className="flex items-center gap-2 rounded px-1.5 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1 truncate">{routine.title}</span>
                    {routine.lastRun?.status === "failed" && (
                      <span className="shrink-0 text-red-600 dark:text-red-400" title="Last run failed">
                        failed
                      </span>
                    )}
                    <span
                      className={cn(
                        "shrink-0 tabular-nums text-muted-foreground",
                        late && "font-semibold text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {late ? "overdue" : formatCountdown(new Date(at).toISOString(), nowMs)}
                    </span>
                  </PlicaLink>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
