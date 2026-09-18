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
  countQueueByAge,
  deriveQueueItems,
  filterQueueByAge,
  flattenLiveRuns,
  groupQueue,
  summarizeQueue,
  upcomingProjects,
  upcomingRoutines,
  type PlicaPortfolioSort,
  type PlicaQueueAgeFilter,
  type PlicaQueueGrouping,
  type PlicaQueueSort,
} from "../lib/queue";
import { PLICA_BOARD_COLUMNS } from "./PlicaBoardRow";
import { PlicaCompanySlot } from "./PlicaCompanySlot";
import { PlicaLiveStrip } from "./PlicaLiveStrip";
import { PlicaPortfolio } from "./PlicaPortfolio";
import { PlicaQueue } from "./PlicaQueue";
import { PlicaRoutineExceptions } from "./PlicaRoutineExceptions";
import { PlicaSegmented } from "./PlicaSegmented";
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
  queueSort,
  onQueueSort,
  ageFilter,
  onAgeFilter,
  portfolioSort,
  onPortfolioSort,
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
  queueSort: PlicaQueueSort;
  onQueueSort: (sort: PlicaQueueSort) => void;
  ageFilter: PlicaQueueAgeFilter;
  onAgeFilter: (filter: PlicaQueueAgeFilter) => void;
  portfolioSort: PlicaPortfolioSort;
  onPortfolioSort: (sort: PlicaPortfolioSort) => void;
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
  // Counted before the filter is applied, so each chip can say how much it is
  // holding back — a chip that reported its own post-filter count would read
  // "0" for every bucket you are not standing in.
  const ageCounts = useMemo(() => countQueueByAge(queueItems, nowMs), [queueItems, nowMs]);
  const visibleItems = useMemo(
    () => filterQueueByAge(queueItems, ageFilter, nowMs),
    [queueItems, ageFilter, nowMs],
  );
  const groups = useMemo(
    () => groupQueue(visibleItems, grouping, companies, { projects, nowMs, sort: queueSort }),
    [visibleItems, grouping, companies, projects, nowMs, queueSort],
  );
  // The badge counts what is on screen: a rail filtered to "today" that still
  // claimed 137 would be describing a list the reader cannot see.
  const summary = useMemo(() => summarizeQueue(visibleItems, nowMs), [visibleItems, nowMs]);
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
        questions: sum.questions + (data?.needsBreakdown?.questions ?? 0),
        blocked: sum.blocked + (data?.needsBreakdown?.blocked ?? 0),
        review: sum.review + (data?.needsBreakdown?.review ?? 0),
        tasksOpen: sum.tasksOpen + (stats?.tasksOpen ?? 0),
        runs: sum.runs + deriveThroughput(data?.summary?.runActivity ?? []).total,
        tokens: sum.tokens + (stats?.tokens ?? 0),
      };
    },
    { needs: 0, questions: 0, blocked: 0, review: 0, tasksOpen: 0, runs: 0, tokens: 0 },
  );

  return (
    <div data-view="board" className="@container/board flex flex-col gap-4">
      {/* Live spans the whole width above the board. It is the one block whose
          height would otherwise track the size of the fleet, so it is the one
          block that must not be allowed a variable height: as a single row of
          pills it cannot change size, and everything below it stays put. */}
      <PlicaLiveStrip entries={live} />

      {/* Side by side only once the board itself is wide enough for the
          ledger's full row (~52rem) beside a readable left column — measured
          on the board, not the window, because the host sidebar decides how
          much of the window Plica gets. Narrower, the ledger and queue lead
          and the two lists sit side by side under them. */}
      <div className="grid gap-4 @[76rem]/board:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] @[90rem]/board:grid-cols-[420px_minmax(0,1fr)] [.plica-kiosk_&]:gap-6 [.plica-kiosk_&]:@[110rem]/board:grid-cols-[540px_minmax(0,1fr)]">
      {/* The rail is a sticky column capped at the viewport rather than pinned
          to it. A fixed height had to guess how much chrome sat above it, and
          guessed high — which pushed Routines off the bottom of the screen. A
          cap cannot: the column is as tall as its contents until that would
          overflow, and only then does Portfolio start scrolling inside itself.
          Routines is `shrink-0`, so it is the one thing that can never be
          squeezed out of view. Stacked, it is a plain two-up grid after the
          ledger and queue. */}
      <div className="order-last grid min-w-0 gap-4 @[48rem]/board:grid-cols-2 @[48rem]/board:items-start @[76rem]/board:order-none @[76rem]/board:sticky @[76rem]/board:top-4 @[76rem]/board:flex @[76rem]/board:max-h-[calc(100vh-2rem)] @[76rem]/board:flex-col @[76rem]/board:items-stretch @[76rem]/board:self-start">
        <PlicaPortfolio
          items={projectEntries}
          nowMs={nowMs}
          companies={companies}
          sort={portfolioSort}
          onSort={onPortfolioSort}
          className="min-h-0 flex-1"
        />
        <PlicaRoutineExceptions items={routines} nowMs={nowMs} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="@container overflow-x-auto rounded-lg border bg-card">
          <table className="w-full table-auto border-collapse text-[length:var(--plica-fs-body,14px)] leading-[1.45]">
            <thead>
              <tr>
                {PLICA_BOARD_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-1.5 py-2 font-semibold uppercase tracking-(--tracking-label) text-muted-foreground",
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
                        <PlicaSegmented
                          label="Pane order"
                          options={[
                            { value: "hot", label: "Hot first" },
                            { value: "manual", label: "My order" },
                          ]}
                          value={sortMode}
                          onChange={onSortMode}
                          className="font-normal"
                        />
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
                  <td className="truncate py-2 pl-3 pr-2 uppercase tracking-(--tracking-label)">All</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{totals.needs}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{totals.questions}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{totals.blocked}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{totals.review}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{totals.tasksOpen}</td>
                  <td className="px-1.5 py-2 tabular-nums">{Math.round((totals.runs / 7) * 10) / 10} /day</td>
                  <td className="px-1.5 py-2 tabular-nums">{formatTokensMillions(totals.tokens)}M</td>
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
          sort={queueSort}
          onSort={onQueueSort}
          ageFilter={ageFilter}
          onAgeFilter={onAgeFilter}
          ageCounts={ageCounts}
          companiesById={companiesById}
          nowMs={nowMs}
          onActed={(companyId) => dataByCompany[companyId]?.invalidate()}
          footer={footer}
          filterCompany={focusCompany}
          onClearFilter={() => setFocusCompanyId(null)}
        />
      </div>
      </div>
    </div>
  );
}
