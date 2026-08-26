import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import {
  PLICA_FREEZE,
  deriveNeedsBreakdown,
  deriveThroughput,
  formatTokensMillions,
  thresholdsFor,
  type PlicaActionable,
  type PlicaCompanyStats,
  type PlicaSortMode,
  type PlicaTokenSettings,
} from "../lib/plica";
import {
  deriveQueueItems,
  flattenLiveRuns,
  groupQueue,
  summarizeQueue,
  upcomingProjects,
  upcomingRoutines,
  type PlicaQueueGrouping,
} from "../lib/queue";
import { PLICA_BOARD_COLUMNS } from "./PlicaBoardRow";
import { PlicaCompanySlot } from "./PlicaCompanySlot";
import { PlicaLiveList } from "./PlicaLiveList";
import { PlicaProjectsList } from "./PlicaProjectsList";
import { PlicaQueue } from "./PlicaQueue";
import { PlicaRoutinesList } from "./PlicaRoutinesList";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

/** Re-render on a slow clock so ages and countdowns don't freeze between polls. */
function useNowMs(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (PLICA_FREEZE) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Queue + Board: the two cross-company lists (live runs, upcoming routines)
 * stacked on the left, one ledger row per company on the right with the
 * action rail under the ledger. Each company still has exactly one PlicaCompanySlot —
 * here it renders the board row and reports its data up, and the page
 * derives the rail and the lists from what it has been told.
 */
export function PlicaBoardPage({
  companies,
  pinnedIds,
  onTogglePin,
  dataByCompany,
  statsByCompany,
  actionableByCompany,
  tokenSettings,
  alertsEnabled,
  onActionable,
  onStats,
  onData,
  sortMode,
  onSortMode,
  grouping,
  onGrouping,
  footer,
}: {
  /** Already ordered: watched first, then hot-first or the sidebar order. */
  companies: Company[];
  pinnedIds: string[];
  onTogglePin: (companyId: string) => void;
  dataByCompany: Record<string, PlicaCompanyData | undefined>;
  statsByCompany: Record<string, PlicaCompanyStats | undefined>;
  actionableByCompany: Record<string, PlicaActionable | undefined>;
  tokenSettings: PlicaTokenSettings;
  alertsEnabled: boolean;
  onActionable: (companyId: string, actionable: PlicaActionable) => void;
  onStats: (companyId: string, stats: PlicaCompanyStats) => void;
  onData: (companyId: string, data: PlicaCompanyData) => void;
  sortMode: PlicaSortMode;
  onSortMode: (mode: PlicaSortMode) => void;
  grouping: PlicaQueueGrouping;
  onGrouping: (grouping: PlicaQueueGrouping) => void;
  footer?: ReactNode;
}) {
  const nowMs = useNowMs();
  // Clicking a row's Need-you count narrows the rail to that company; clicking
  // it again (or the rail's chip) widens it back. Not persisted — it is a
  // glance, not a setting.
  const [focusCompanyId, setFocusCompanyId] = useState<string | null>(null);
  const focusCompany = focusCompanyId ? companies.find((company) => company.id === focusCompanyId) ?? null : null;
  const toggleFocus = (companyId: string) =>
    setFocusCompanyId((current) => (current === companyId ? null : companyId));
  const companiesById = useMemo(
    () => Object.fromEntries(companies.map((company) => [company.id, company])) as Record<string, Company | undefined>,
    [companies],
  );
  // Memoised on its inputs: every derivation below keys off this array, so a
  // fresh one per render would recompute the queue on every poll of any query.
  const loaded = useMemo(
    () =>
      companies
        .map((company) => ({ company, data: dataByCompany[company.id] }))
        .filter((entry): entry is { company: Company; data: PlicaCompanyData } => entry.data !== undefined),
    [companies, dataByCompany],
  );

  const queueItems = useMemo(
    () =>
      loaded
        .filter(({ company }) => !focusCompanyId || company.id === focusCompanyId)
        .flatMap(({ company, data }) =>
        deriveQueueItems({
          companyId: company.id,
          approvals: data.approvals,
          attention: data.attention,
          agents: data.agents,
          routines: data.routines,
          issues: data.issues,
          nowMs,
        }),
      ),
    [loaded, nowMs, focusCompanyId],
  );
  const projects = useMemo(() => loaded.flatMap(({ data }) => data.projects), [loaded]);
  const groups = useMemo(
    () => groupQueue(queueItems, grouping, companies, { projects, nowMs }),
    [queueItems, grouping, companies, projects, nowMs],
  );
  const summary = useMemo(() => summarizeQueue(queueItems, nowMs), [queueItems, nowMs]);
  const live = useMemo(
    () => flattenLiveRuns(loaded.map(({ company, data }) => ({ company, runs: data.liveRuns, issues: data.issues }))),
    [loaded],
  );
  const routines = useMemo(
    () => upcomingRoutines(loaded.map(({ company, data }) => ({ company, routines: data.routines })), nowMs),
    [loaded, nowMs],
  );
  const projectEntries = useMemo(
    () => upcomingProjects(loaded.map(({ company, data }) => ({ company, projects: data.projects, issues: data.issues })), nowMs),
    [loaded, nowMs],
  );

  const totals = companies.reduce(
    (sum, company) => {
      const stats = statsByCompany[company.id];
      const data = dataByCompany[company.id];
      const actionable = actionableByCompany[company.id];
      return {
        needs: sum.needs + (actionable?.count ?? 0),
        questions: sum.questions + deriveNeedsBreakdown(data?.attention).questions,
        blocked: sum.blocked + deriveNeedsBreakdown(data?.attention).blocked,
        review: sum.review + deriveNeedsBreakdown(data?.attention).review,
        tasksOpen: sum.tasksOpen + (stats?.tasksOpen ?? 0),
        runs: sum.runs + deriveThroughput(data?.summary?.runActivity ?? []).total,
        tokens: sum.tokens + (stats?.tokens ?? 0),
      };
    },
    { needs: 0, questions: 0, blocked: 0, review: 0, tasksOpen: 0, runs: 0, tokens: 0 },
  );

  return (
    <div data-view="board" className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] [.plica-kiosk_&]:gap-6 [.plica-kiosk_&]:xl:grid-cols-[540px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <PlicaLiveList entries={live} />
        <PlicaRoutinesList items={routines} companies={companies} nowMs={nowMs} />
        <PlicaProjectsList items={projectEntries} companies={companies} nowMs={nowMs} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full table-auto border-collapse text-[length:var(--plica-fs-body,14px)] leading-[1.45]">
            <thead>
              <tr>
                {PLICA_BOARD_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-2 py-2 font-semibold uppercase tracking-wide text-muted-foreground",
                      MICRO,
                      column.align === "right" ? "text-right" : "text-left",
                      // Company takes every spare pixel; the figures take only
                      // what they need, so the row never has to scroll.
                      column.key === "company" ? "w-full pl-3" : "w-px",
                    )}
                  >
                    {column.key === "company" ? (
                      <span className="flex items-center gap-2">
                        {column.label}
                        <span role="group" aria-label="Pane order" className="flex items-center rounded-md border p-0.5 normal-case tracking-normal">
                          {(["hot", "manual"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              aria-pressed={sortMode === mode}
                              onClick={() => onSortMode(mode)}
                              className={cn(
                                "rounded px-1.5 py-0 font-normal",
                                sortMode === mode ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {mode === "hot" ? "Hot first" : "My order"}
                            </button>
                          ))}
                        </span>
                      </span>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <PlicaCompanySlot
                  key={company.id}
                  company={company}
                  onActionable={onActionable}
                  onStats={onStats}
                  onData={onData}
                  tokenThresholds={thresholdsFor(tokenSettings, company.id)}
                  alertsEnabled={alertsEnabled}
                  pinned={pinnedIds.includes(company.id)}
                  onTogglePin={() => onTogglePin(company.id)}
                  onFocusNeeds={() => toggleFocus(company.id)}
                  needsFocused={focusCompanyId === company.id}
                />
              ))}
            </tbody>
            {companies.length > 1 && (
              <tfoot>
                <tr data-board-totals className={cn("border-t text-muted-foreground", MICRO)}>
                  <td className="truncate py-2 pl-3 pr-2 uppercase tracking-wide">All</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.needs}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.questions}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.blocked}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.review}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.tasksOpen}</td>
                  <td className="px-3 py-2 tabular-nums">{Math.round((totals.runs / 7) * 10) / 10} /day</td>
                  <td className="px-3 py-2 tabular-nums">{formatTokensMillions(totals.tokens)}M</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <PlicaQueue
          groups={groups}
          summary={summary}
          grouping={grouping}
          onGrouping={onGrouping}
          companiesById={companiesById}
          nowMs={nowMs}
          onActed={(companyId) => dataByCompany[companyId]?.invalidate()}
          footer={footer}
          filterCompany={focusCompany}
          onClearFilter={() => setFocusCompanyId(null)}
        />
      </div>
    </div>
  );
}
