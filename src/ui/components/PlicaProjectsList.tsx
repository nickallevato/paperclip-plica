import { FolderKanban } from "lucide-react";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";
import type { PlicaProjectEntry } from "../lib/queue";
import { PlicaLink } from "./PlicaLink";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

function dueLabel(entry: PlicaProjectEntry, nowMs: number): string | null {
  if (entry.dueMs === null) return null;
  const days = Math.round((entry.dueMs - nowMs) / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 14) return `due in ${days}d`;
  return `due in ${Math.round(days / 7)}w`;
}

/**
 * What is in flight, by project, across companies — open work with how much
 * of it is moving, how much is stuck, and the nearest deadline first.
 */
export function PlicaProjectsList({
  items,
  overflow,
  nowMs,
}: {
  items: PlicaProjectEntry[];
  overflow: number;
  nowMs: number;
}) {
  return (
    <section data-plica-projects className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3">
      <h3 className={`flex items-center gap-2 ${MICRO} font-semibold uppercase tracking-wide text-muted-foreground`}>
        <FolderKanban className="h-3 w-3" />
        Projects · in flight
      </h3>
      {items.length === 0 ? (
        <p className={`${MICRO} italic text-muted-foreground`}>no open project work</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((entry) => {
            const due = dueLabel(entry, nowMs);
            const moving = entry.open > 0 ? Math.round((entry.inProgress / entry.open) * 100) : 0;
            const stuck = entry.open > 0 ? Math.round((entry.blocked / entry.open) * 100) : 0;
            return (
              <li
                key={`${entry.company.id}:${entry.project.id}`}
                className="flex flex-col gap-1 py-0.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45]"
              >
                <div className="flex items-center gap-2.5">
                  <CompanyPatternIcon
                    companyName={entry.company.name}
                    logoUrl={entry.company.logoUrl}
                    brandColor={entry.company.brandColor}
                    className="size-5 shrink-0 rounded-md text-[8px]"
                  />
                  <PlicaLink
                    to={`/${entry.company.issuePrefix}/projects/${entry.project.urlKey ?? entry.project.id}`}
                    companyId={entry.company.id}
                    className="min-w-0 flex-1 truncate font-medium hover:underline decoration-dotted underline-offset-2"
                    title={`${entry.project.name} · ${entry.company.name}`}
                  >
                    {entry.project.name}
                  </PlicaLink>
                  <span className={cn(MICRO, "shrink-0 tabular-nums text-muted-foreground")}>
                    {entry.open} open
                    {entry.blocked > 0 && (
                      <span className="text-amber-700 dark:text-amber-300"> · {entry.blocked} blocked</span>
                    )}
                  </span>
                  {due && (
                    <span
                      className={cn(
                        MICRO,
                        "shrink-0 tabular-nums",
                        entry.overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground",
                      )}
                      title={new Date(entry.dueMs as number).toLocaleDateString()}
                    >
                      {due}
                    </span>
                  )}
                </div>
                <div
                  className="ml-[30px] flex h-1 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${entry.inProgress} in progress, ${entry.blocked} blocked, of ${entry.open} open`}
                  title={`${entry.inProgress} in progress · ${entry.blocked} blocked · ${entry.open} open`}
                >
                  <span className="bg-emerald-500" style={{ width: `${moving}%` }} />
                  <span className="bg-amber-500" style={{ width: `${stuck}%` }} />
                </div>
              </li>
            );
          })}
          {overflow > 0 && <li className={`${MICRO} text-muted-foreground`}>+{overflow} more</li>}
        </ul>
      )}
    </section>
  );
}
