import { AlertTriangle, CalendarClock, CircleSlash, Timer } from "lucide-react";
import { cn } from "../host/util";
import { CompanyPatternIcon } from "../host/ui-kit";
import { formatAgeMinutes } from "../lib/plica";
import { routineExceptions, type PlicaRoutineExceptionKind, type PlicaUpcomingRoutine } from "../lib/queue";
import { PlicaLink } from "./PlicaLink";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";
const BODY = "text-[length:var(--plica-fs-body,14px)] leading-[1.45]";

const KIND_ICON: Record<PlicaRoutineExceptionKind, typeof AlertTriangle> = {
  failed: AlertTriangle,
  blocked: CircleSlash,
  overdue: Timer,
};

const KIND_TONE: Record<PlicaRoutineExceptionKind, string> = {
  failed: "text-plica-alarm",
  blocked: "text-plica-wait",
  overdue: "text-plica-wait",
};

/**
 * Routines, but only the broken ones.
 *
 * The list this replaced drew every scheduled routine in weekday order — a
 * week's timetable that told you nothing you did not already know, and gave
 * the two that had actually failed the same weight as the eighteen that were
 * fine. Here a healthy routine is a number in the header and nothing else, so
 * the block is two lines tall on a good day and empty on a perfect one.
 */
export function PlicaRoutineExceptions({ items, nowMs }: { items: PlicaUpcomingRoutine[]; nowMs: number }) {
  const { items: exceptions, healthy } = routineExceptions(items, nowMs);

  return (
    <section data-plica-routines className="flex shrink-0 flex-col rounded-lg border bg-card">
      <h3
        className={cn(
          "flex shrink-0 items-center gap-2 px-3 pb-2 pt-3 font-semibold uppercase tracking-wide text-muted-foreground",
          MICRO,
        )}
      >
        <CalendarClock className="h-3 w-3" />
        Routines
        {exceptions.length > 0 && (
          <span className="ml-auto font-normal normal-case tracking-normal tabular-nums text-plica-alarm">
            {exceptions.length} need{exceptions.length === 1 ? "s" : ""} attention
          </span>
        )}
      </h3>

      {exceptions.length === 0 ? (
        <p className={cn("px-3 pb-3 italic text-muted-foreground", MICRO)}>
          {healthy === 0 ? "nothing scheduled" : `all ${healthy} routines healthy`}
        </p>
      ) : (
        <>
          {/* Capped rather than scrolled: broken routines are rare, and a
              scrollbar here would imply there is always more to find. */}
          <ul className="max-h-40 overflow-y-auto px-3">
            {exceptions.map(({ item, kind, label, lateMs, issue }) => {
              const { company, routine } = item;
              const Icon = KIND_ICON[kind];
              return (
                <li
                  key={`${company.id}:${routine.id}`}
                  data-routine-exception={kind}
                  className={cn("flex items-center gap-2 py-1", BODY)}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", KIND_TONE[kind])} aria-hidden="true" />
                  <CompanyPatternIcon
                    companyName={company.name}
                    logoUrl={company.logoUrl}
                    brandColor={company.brandColor}
                    className="size-4 shrink-0 rounded text-[7px]"
                  />
                  <PlicaLink
                    to={
                      issue
                        ? `/${company.issuePrefix}/issues/${issue.identifier ?? issue.id}`
                        : `/${company.issuePrefix}/routines/${routine.id}`
                    }
                    companyId={company.id}
                    className="min-w-0 flex-1 truncate hover:underline decoration-dotted underline-offset-2"
                    title={`${routine.title} · ${company.name} — ${label}`}
                  >
                    {routine.title}
                  </PlicaLink>
                  <span className={cn("shrink-0 tabular-nums", MICRO, KIND_TONE[kind])}>
                    {kind === "overdue" && lateMs !== null
                      ? `overdue ${formatAgeMinutes(Math.round(lateMs / 60_000))}`
                      : kind}
                  </span>
                </li>
              );
            })}
          </ul>
          {healthy > 0 && (
            <p className={cn("shrink-0 border-t px-3 py-1.5 text-muted-foreground", MICRO)}>
              {healthy} healthy routine{healthy === 1 ? "" : "s"} not shown
            </p>
          )}
        </>
      )}
    </section>
  );
}
