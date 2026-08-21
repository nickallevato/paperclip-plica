import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import {
  formatCents,
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
  upcomingRoutines,
  type PlicaQueueGrouping,
} from "../lib/queue";
import { PLICA_BOARD_COLUMNS } from "./PlicaBoardRow";
import { PlicaCompanySlot } from "./PlicaCompanySlot";
import { PlicaLiveList } from "./PlicaLiveList";
import { PlicaQueue } from "./PlicaQueue";
import { PlicaRoutinesList } from "./PlicaRoutinesList";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

/** Re-render on a slow clock so ages and countdowns don't freeze between polls. */
function useNowMs(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Queue + Board: the action rail on the left, one ledger row per company on
 * the right, and the two cross-company lists (live runs, upcoming routines)
 * under the ledger. Each company still has exactly one PlicaCompanySlot —
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
  const companiesById = useMemo(
    () => Object.fromEntries(companies.map((company) => [company.id, company])) as Record<string, Company | undefined>,
    [companies],
  );
  const loaded = companies
    .map((company) => ({ company, data: dataByCompany[company.id] }))
    .filter((entry): entry is { company: Company; data: PlicaCompanyData } => entry.data !== undefined);

  const queueItems = useMemo(
    () =>
      loaded.flatMap(({ company, data }) =>
        deriveQueueItems({
          companyId: company.id,
          approvals: data.approvals,
          attention: data.attention,
          agents: data.agents,
          routines: data.routines,
          nowMs,
        }),
      ),
    [loaded, nowMs],
  );
  const groups = useMemo(() => groupQueue(queueItems, grouping, companies), [queueItems, grouping, companies]);
  const summary = useMemo(() => summarizeQueue(queueItems, nowMs), [queueItems, nowMs]);
  const live = useMemo(
    () => flattenLiveRuns(loaded.map(({ company, data }) => ({ company, runs: data.liveRuns, issues: data.issues }))),
    [loaded],
  );
  const routines = useMemo(
    () => upcomingRoutines(loaded.map(({ company, data }) => ({ company, routines: data.routines })), nowMs),
    [loaded, nowMs],
  );

  const totals = companies.reduce(
    (sum, company) => {
      const stats = statsByCompany[company.id];
      const data = dataByCompany[company.id];
      const actionable = actionableByCompany[company.id];
      return {
        running: sum.running + (stats?.running ?? 0),
        active: sum.active + (stats?.active ?? 0),
        tasks: sum.tasks + (stats?.tasks ?? 0),
        needs: sum.needs + (actionable?.count ?? 0),
        routines: sum.routines + (stats?.routines ?? 0),
        troubled: sum.troubled + (stats?.routinesOverdue ?? 0) + (stats?.routinesFailing ?? 0),
        spend: sum.spend + (data?.summary?.costs.monthSpendCents ?? 0),
        budget: sum.budget + (data?.summary?.costs.monthBudgetCents ?? 0),
      };
    },
    { running: 0, active: 0, tasks: 0, needs: 0, routines: 0, troubled: 0, spend: 0, budget: 0 },
  );

  return (
    <div data-view="board" className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
      <PlicaQueue
        groups={groups}
        summary={summary}
        grouping={grouping}
        onGrouping={onGrouping}
        companiesById={companiesById}
        nowMs={nowMs}
        onActed={(companyId) => dataByCompany[companyId]?.invalidate()}
        footer={footer}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full border-collapse text-[length:var(--plica-fs-body,14px)] leading-[1.45]">
            <thead>
              <tr>
                {PLICA_BOARD_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground",
                      MICRO,
                      column.align === "right" ? "text-right" : "text-left",
                      column.key === "company" && "pl-4",
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
                  view="board"
                  onActionable={onActionable}
                  onStats={onStats}
                  onData={onData}
                  tokenThresholds={thresholdsFor(tokenSettings, company.id)}
                  alertsEnabled={alertsEnabled}
                  pinned={pinnedIds.includes(company.id)}
                  onTogglePin={() => onTogglePin(company.id)}
                />
              ))}
            </tbody>
            {companies.length > 1 && (
              <tfoot>
                <tr data-board-totals className={cn("border-t text-muted-foreground", MICRO)}>
                  <td className="py-2 pl-4 pr-3 uppercase tracking-wide">All companies</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totals.running} / {totals.active}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.tasks}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totals.needs}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {totals.routines}
                    {totals.troubled > 0 && ` · ${totals.troubled} need care`}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatCents(totals.spend)}
                    {totals.budget > 0 && ` / ${formatCents(totals.budget)}`}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <PlicaLiveList entries={live} />
          <PlicaRoutinesList items={routines.items} overflow={routines.overflow} nowMs={nowMs} />
        </div>
      </div>
    </div>
  );
}
