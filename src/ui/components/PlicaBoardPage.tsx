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
  isSnoozed,
  summarizeDecide,
  summarizeQueue,
  upcomingProjects,
  upcomingRoutines,
  type PlicaPortfolioSort,
  type PlicaQueueAgeFilter,
  type PlicaQueueGrouping,
  type PlicaQueueSort,
} from "../lib/queue";
import { PlicaCompanySlot } from "./PlicaCompanySlot";
import { PlicaLiveStrip } from "./PlicaLiveStrip";
import { PlicaPortfolio } from "./PlicaPortfolio";
import { PlicaQueue } from "./PlicaQueue";
import { PlicaRoutineExceptions } from "./PlicaRoutineExceptions";
import { PlicaSegmented } from "./PlicaSegmented";
import type { PlicaCompanyData } from "./usePlicaCompanyData";
import { applyTriageOverrides, useQueueTriage } from "./useQueueTriage";

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
 * Queue + Board: a column of context on the left — one line per company, the
 * portfolio, routines that need attention — and the Needs-you queue owning the
 * main column. Each company still has exactly one PlicaCompanySlot; it renders
 * the company's line and reports its data up, and the page derives the queue
 * and the lists from what it has been told.
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
  const { overrides, busy: triageBusy, triage } = useQueueTriage((companyId) => dataByCompany[companyId]?.invalidate());
  // Pending decide-by / snooze / archive writes applied on top, so a row moves
  // when clicked rather than a poll later. Snoozed items only exist in the
  // Decide-by grouping's Snoozed lane; everywhere else they are simply away.
  const triagedItems = useMemo(() => {
    const applied = applyTriageOverrides(queueItems, overrides);
    return grouping === "decide" ? applied : applied.filter((item) => !isSnoozed(item, nowMs));
  }, [queueItems, overrides, grouping, nowMs]);
  const projects = useMemo(() => loaded.flatMap(({ data }) => data.projects), [loaded]);
  // Counted before the filter is applied, so each chip can say how much it is
  // holding back — a chip that reported its own post-filter count would read
  // "0" for every bucket you are not standing in.
  const ageCounts = useMemo(() => countQueueByAge(triagedItems, nowMs), [triagedItems, nowMs]);
  const visibleItems = useMemo(
    () => filterQueueByAge(triagedItems, ageFilter, nowMs),
    [triagedItems, ageFilter, nowMs],
  );
  const decideSummary = useMemo(() => summarizeDecide(visibleItems, nowMs), [visibleItems, nowMs]);
  const groups = useMemo(
    () => groupQueue(visibleItems, grouping, companies, { projects, nowMs, sort: queueSort }),
    [visibleItems, grouping, companies, projects, nowMs, queueSort],
  );
  // The badge counts what is on screen: a rail filtered to "today" that still
  // claimed 137 would be describing a list the reader cannot see.
  const summary = useMemo(
    () => summarizeQueue(visibleItems.filter((item) => !isSnoozed(item, nowMs)), nowMs),
    [visibleItems, nowMs],
  );
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
        runs: sum.runs + deriveThroughput(data?.summary?.runActivity ?? []).total,
        tokens: sum.tokens + (stats?.tokens ?? 0),
      };
    },
    { needs: 0, runs: 0, tokens: 0 },
  );

  // Wide: one sticky column of context (Companies, Portfolio, Routines) beside
  // the queue, which owns the main column because it is where the work is.
  // The left column's wrapper is `display: contents` when narrow, so its three
  // panels join the page grid and `order` can slot the queue in after
  // Companies instead of after everything. Widths are measured on the board,
  // not the window — the host sidebar decides how much of the window Plica
  // gets. 64rem is a 400px column plus a queue wide enough for its inline
  // decide-by picks.
  return (
    <div data-view="board" className="@container/board flex flex-col gap-4">
      {/* Live spans the whole width above the board. It is the one block whose
          height would otherwise track the size of the fleet, so it is the one
          block that must not be allowed a variable height: as a single row of
          pills it cannot change size, and everything below it stays put. */}
      <PlicaLiveStrip entries={live} />

      <div className="grid gap-4 @[64rem]/board:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] @[96rem]/board:grid-cols-[440px_minmax(0,1fr)] [.plica-kiosk_&]:gap-6 [.plica-kiosk_&]:@[110rem]/board:grid-cols-[540px_minmax(0,1fr)]">
        {/* Capped at the viewport rather than pinned to it: the column is as
            tall as its contents until that would overflow, and only then does
            Portfolio scroll inside itself. Companies and Routines are
            `shrink-0`, so neither can be squeezed out of view. */}
        <div className="contents @[64rem]/board:sticky @[64rem]/board:top-4 @[64rem]/board:flex @[64rem]/board:max-h-[calc(100vh-2rem)] @[64rem]/board:min-w-0 @[64rem]/board:flex-col @[64rem]/board:gap-4 @[64rem]/board:self-start">
          <section
            data-plica-companies
            aria-label="Orgs"
            className="order-1 flex shrink-0 flex-col rounded-lg border bg-card @[64rem]/board:order-none"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <h2 className={cn(MICRO, "font-semibold uppercase tracking-(--tracking-label) text-muted-foreground")}>
                Orgs
              </h2>
              <PlicaSegmented
                label="Org order"
                options={[
                  { value: "hot", label: "Hot first" },
                  { value: "manual", label: "My order" },
                ]}
                value={sortMode}
                onChange={onSortMode}
              />
              <span className={cn(MICRO, "ml-auto text-muted-foreground")}>need you</span>
            </div>
            <ul className="flex flex-col">
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
            </ul>
            {companies.length > 1 && (
              <div
                data-board-totals
                className={cn(MICRO, "flex items-center gap-2.5 border-t px-3 py-1.5 tabular-nums text-muted-foreground")}
              >
                <span className="uppercase tracking-(--tracking-label)">All</span>
                <span className="ml-auto">{formatTokensMillions(totals.tokens)}M tokens</span>
                <span className="w-12 text-right">{Math.round((totals.runs / 7) * 10) / 10}/d</span>
                <span className="w-8 text-right font-semibold text-foreground">{totals.needs}</span>
              </div>
            )}
          </section>
          <PlicaPortfolio
            items={projectEntries}
            nowMs={nowMs}
            companies={companies}
            sort={portfolioSort}
            onSort={onPortfolioSort}
            className="order-3 min-h-0 flex-1 @[64rem]/board:order-none"
          />
          <div className="order-4 shrink-0 @[64rem]/board:order-none">
            <PlicaRoutineExceptions items={routines} nowMs={nowMs} />
          </div>
        </div>

        <div className="order-2 min-w-0 @[64rem]/board:order-none">
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
            decideSummary={decideSummary}
            onTriage={triage}
            triageBusy={triageBusy}
            footer={footer}
            filterCompany={focusCompany}
            onClearFilter={() => setFocusCompanyId(null)}
          />
        </div>
      </div>
    </div>
  );
}
