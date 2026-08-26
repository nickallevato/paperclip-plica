import { FolderKanban } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import { groupByCompany, type PlicaProjectEntry } from "../lib/queue";
import { PlicaCompanyGroup } from "./PlicaCompanyGroup";
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

/** The collapsed reading for one company's projects: how much work, what is late. */
function summarize(items: PlicaProjectEntry[], nowMs: number): { text: string; tone: "quiet" | "wait" | "alarm" } {
  const open = items.reduce((sum, entry) => sum + entry.open, 0);
  const blocked = items.reduce((sum, entry) => sum + entry.blocked, 0);
  const overdue = items.filter((entry) => entry.overdue).length;
  const next = items.find((entry) => entry.dueMs !== null && !entry.overdue);
  const parts = [`${open} open`];
  if (blocked > 0) parts.push(`${blocked} blocked`);
  if (overdue > 0) parts.push(`${overdue} overdue`);
  else if (next) parts.push(dueLabel(next, nowMs) ?? "");
  return {
    text: parts.filter(Boolean).join(" · "),
    tone: overdue > 0 ? "alarm" : blocked > 0 ? "wait" : "quiet",
  };
}

/**
 * Projects by company, each foldable — open work with how much of it is
 * moving, how much is stuck, and the nearest deadline first.
 *
 * Companies follow the board's own order, so the same company sits in the
 * same place in every list on the page.
 */
export function PlicaProjectsList({
  items,
  companies = [],
  nowMs,
}: {
  items: PlicaProjectEntry[];
  /** The board's company order, so the rail sits in the same order as the ledger. */
  companies?: Company[];
  nowMs: number;
}) {
  const groups = groupByCompany(items, companies);
  return (
    <section data-plica-projects className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3">
      <h3 className={`flex items-center gap-2 ${MICRO} font-semibold uppercase tracking-wide text-muted-foreground`}>
        <FolderKanban className="h-3 w-3" />
        Projects
      </h3>
      {items.length === 0 ? (
        <p className={`${MICRO} italic text-muted-foreground`}>no open project work</p>
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
                {group.items.map((entry) => {
            const due = dueLabel(entry, nowMs);
            const moving = entry.open > 0 ? Math.round((entry.inProgress / entry.open) * 100) : 0;
            const stuck = entry.open > 0 ? Math.round((entry.blocked / entry.open) * 100) : 0;
            return (
              <li
                key={`${entry.company.id}:${entry.project.id}`}
                className="flex flex-col gap-1 py-0.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45]"
              >
                <div className="flex items-center gap-2.5">
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
                    {entry.blocked > 0 && <span> · {entry.blocked} blocked</span>}
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
                  className="flex h-1 overflow-hidden rounded-full bg-muted/60"
                  role="img"
                  aria-label={`${entry.inProgress} in progress, ${entry.blocked} blocked, of ${entry.open} open`}
                  title={`${entry.inProgress} in progress · ${entry.blocked} blocked · ${entry.open} open`}
                >
                  <span className="bg-emerald-500/45 dark:bg-emerald-400/35" style={{ width: `${moving}%` }} />
                  <span className="bg-amber-500/45 dark:bg-amber-400/35" style={{ width: `${stuck}%` }} />
                </div>
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
