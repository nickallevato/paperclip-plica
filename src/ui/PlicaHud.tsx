import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Bell, BellOff, FoldVertical, Layers, Maximize, Minimize, Pin, TriangleAlert, UnfoldVertical } from "lucide-react";
import type { DashboardSummary } from "@paperclipai/shared";
import { authApi } from "./host/api";
import { companiesListQueryOptions } from "./host/companies-query";
import { useBreadcrumbs } from "./host/shims";
import { useCompanyOrder } from "./host/useCompanyOrder";
import { dashboardApi } from "./host/api";
import { PlicaBriefing } from "./components/PlicaBriefing";
import { PlicaCompanySlot } from "./components/PlicaCompanySlot";
import { PlicaDockedTile } from "./components/PlicaDockedTile";
import { PLICA_SCOREBOARD_COLUMNS } from "./components/PlicaScoreboardRow";
import { PlicaTote } from "./components/PlicaTote";
import { cn } from "./host/util";
import {
  PLICA_ALERTS_STORAGE_KEY,
  PLICA_LAST_VISIT_STORAGE_KEY,
  PLICA_LAYOUT_CLASSES,
  PLICA_LAYOUT_STORAGE_KEY,
  PLICA_VIEW_STORAGE_KEY,
  normalizeAlertsEnabled,
  normalizeLayoutMode,
  normalizeViewMode,
  PLICA_ATTENTION_KINDS,
  PLICA_BAR_STORAGE_KEY,
  PLICA_COLLAPSED_STORAGE_KEY,
  PLICA_PINNED_STORAGE_KEY,
  PLICA_ROWS_STORAGE_KEY,
  PLICA_SORT_STORAGE_KEY,
  PLICA_TOKEN_THRESHOLDS_STORAGE_KEY,
  normalizeBarMode,
  normalizeCollapsedIds,
  normalizePinnedIds,
  normalizeRowMode,
  normalizeSortMode,
  normalizeTokenSettings,
  thresholdsFor,
  orderTriageCompanies,
  partitionHotFirst,
  type PlicaSortMode,
  plicaRefetchInterval,
  shouldShowBriefing,
  type PlicaActionable,
  type PlicaBarMode,
  type PlicaCompanyStats,
  type PlicaLayoutMode,
  type PlicaRowMode,
  type PlicaViewMode,
} from "./lib/plica";
import { queryKeys } from "./host/util";

const LAYOUT_MODES: Array<{ mode: PlicaLayoutMode; label: string }> = [
  { mode: "auto", label: "Auto" },
  { mode: "1", label: "1" },
  { mode: "2", label: "2" },
  { mode: "3", label: "3" },
];

const VIEW_MODES: Array<{ mode: PlicaViewMode; label: string }> = [
  { mode: "wall", label: "Wall" },
  { mode: "triage", label: "Triage" },
];

const ROW_MODES: Array<{ mode: PlicaRowMode; label: string }> = [
  { mode: "ledger", label: "Ledger" },
  { mode: "digest", label: "Digest" },
  { mode: "card", label: "Cards" },
];

const BAR_MODES: Array<{ mode: PlicaBarMode; label: string }> = [
  { mode: "signal", label: "Signal" },
  { mode: "matrix", label: "Matrix" },
  { mode: "scoreboard", label: "Scoreboard" },
  { mode: "tote", label: "Tote" },
];

export function PlicaHud() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Plica" }]);
  }, [setBreadcrumbs]);
  const [layout, setLayout] = useState<PlicaLayoutMode>(() =>
    normalizeLayoutMode(typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_LAYOUT_STORAGE_KEY)),
  );
  const selectLayout = (mode: PlicaLayoutMode) => {
    setLayout(mode);
    try {
      localStorage.setItem(PLICA_LAYOUT_STORAGE_KEY, mode);
    } catch {
      // storage unavailable (private mode) — layout still applies for this session
    }
  };
  // Pinned companies are hoisted out of the wall into the bar, so a company
  // is in exactly one place — which is what keeps the wall's column count
  // meaning something. Persisted alongside the other layout preferences.
  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    normalizePinnedIds(typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_PINNED_STORAGE_KEY)),
  );
  const persistPinned = (ids: string[]) => {
    setPinnedIds(ids);
    try {
      localStorage.setItem(PLICA_PINNED_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // storage unavailable (private mode) — pins still apply for this session
    }
  };
  const togglePinned = (companyId: string) =>
    persistPinned(
      pinnedIds.includes(companyId) ? pinnedIds.filter((id) => id !== companyId) : [...pinnedIds, companyId],
    );
  const [statsByCompany, setStatsByCompany] = useState<Record<string, PlicaCompanyStats | undefined>>({});
  const handleStats = useCallback((companyId: string, stats: PlicaCompanyStats) => {
    setStatsByCompany((current) => ({ ...current, [companyId]: stats }));
  }, []);
  const [tokenSettings] = useState(() =>
    normalizeTokenSettings(
      typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_TOKEN_THRESHOLDS_STORAGE_KEY),
    ),
  );
  const [rowMode, setRowMode] = useState<PlicaRowMode>(() =>
    normalizeRowMode(typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_ROWS_STORAGE_KEY)),
  );
  const selectRowMode = (mode: PlicaRowMode) => {
    setRowMode(mode);
    try {
      localStorage.setItem(PLICA_ROWS_STORAGE_KEY, mode);
    } catch {
      // storage unavailable (private mode) — row mode still applies for this session
    }
  };
  const [barMode, setBarMode] = useState<PlicaBarMode>(() =>
    normalizeBarMode(typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_BAR_STORAGE_KEY)),
  );
  const selectBarMode = (mode: PlicaBarMode) => {
    setBarMode(mode);
    try {
      localStorage.setItem(PLICA_BAR_STORAGE_KEY, mode);
    } catch {
      // storage unavailable (private mode) — bar mode still applies for this session
    }
  };
  const [view, setView] = useState<PlicaViewMode>(() =>
    normalizeViewMode(typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_VIEW_STORAGE_KEY)),
  );
  const selectView = (mode: PlicaViewMode) => {
    setView(mode);
    try {
      localStorage.setItem(PLICA_VIEW_STORAGE_KEY, mode);
    } catch {
      // storage unavailable (private mode) — view still applies for this session
    }
  };

  // Kiosk mode: fullscreens the HUD root and bumps text/spacing slightly.
  // Not persisted (spec §4) — always starts off; `fullscreenchange` is the
  // source of truth for `isKiosk` since fullscreen can also be exited via
  // Esc or browser chrome, not just our own button.
  const rootRef = useRef<HTMLDivElement>(null);
  const [isKiosk, setIsKiosk] = useState(false);
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsKiosk(document.fullscreenElement === rootRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  const toggleKiosk = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void rootRef.current?.requestFullscreen();
    }
  };
  // Plica's type scale. Both modes are declared here, not just kiosk: every
  // size is written as text-[length:var(--plica-fs-*,<default>)], and while the
  // vars went unset at the desk each call site fell back to whatever default it
  // happened to carry — which had drifted apart (micro was 10px in some panes
  // and 11px in others, stat 13px vs 14px). Declaring both modes keeps one
  // value per role. Desk tracks the host app (micro = --text-micro, body =
  // text-sm, stat = text-base) so Plica doesn't read a step smaller than the
  // rest of Paperclip; kiosk is ~1.3x for a TV across the room. Line-height
  // rides along on the utility as a unitless ratio, so it scales with the size
  // rather than needing a second set of vars. Set on the document root (not the
  // HUD div) so portaled hover cards inherit too; nothing outside Plica reads
  // these vars.
  useEffect(() => {
    const style = document.documentElement.style;
    const scale = isKiosk
      ? { micro: "14px", body: "18px", stat: "21px", title: "26px" }
      : { micro: "11px", body: "14px", stat: "16px", title: "20px" };
    for (const [role, size] of Object.entries(scale)) {
      style.setProperty(`--plica-fs-${role}`, size);
    }
    return () => {
      for (const role of Object.keys(scale)) {
        style.removeProperty(`--plica-fs-${role}`);
      }
    };
  }, [isKiosk]);

  // Alerts (§5): off by default, persisted; enabling requests Notification
  // permission (only when it hasn't been decided yet — "default").
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() =>
    normalizeAlertsEnabled(typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_ALERTS_STORAGE_KEY)),
  );
  const toggleAlerts = () => {
    const next = !alertsEnabled;
    setAlertsEnabled(next);
    try {
      localStorage.setItem(PLICA_ALERTS_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // storage unavailable (private mode) — alerts still apply for this session
    }
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };
  // Briefing (§7): read the previous visit timestamp on mount (before
  // overwriting it), and only show the strip while it's un-dismissed for
  // this visit. `plica.lastVisit` is then refreshed on mount and every 5
  // minutes while the HUD stays open, so a long-lived tab doesn't keep
  // reporting a stale "since" time to itself.
  const [lastVisit] = useState<string | null>(() => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_LAST_VISIT_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  // Calm accordion: at most one triage company expanded at a time.
  const [openTriageCompanyId, setOpenTriageCompanyId] = useState<string | null>(null);
  // Per-company wall collapse ("as if it had nothing"), persisted per browser.
  const [collapsedIds, setCollapsedIds] = useState<string[]>(() =>
    normalizeCollapsedIds(typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_COLLAPSED_STORAGE_KEY)),
  );
  const toggleCollapsed = useCallback((companyId: string) => {
    setCollapsedIds((current) => {
      const next = current.includes(companyId)
        ? current.filter((id) => id !== companyId)
        : [...current, companyId];
      try {
        localStorage.setItem(PLICA_COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable — collapse still applies for this session
      }
      return next;
    });
  }, []);
  const setCollapsedAll = useCallback((ids: string[]) => {
    setCollapsedIds(ids);
    try {
      localStorage.setItem(PLICA_COLLAPSED_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // storage unavailable — collapse still applies for this session
    }
  }, []);
  const showBriefing = !briefingDismissed && lastVisit !== null && shouldShowBriefing(lastVisit, Date.now());

  useEffect(() => {
    const recordVisit = () => {
      try {
        localStorage.setItem(PLICA_LAST_VISIT_STORAGE_KEY, new Date().toISOString());
      } catch {
        // storage unavailable (private mode) — briefing just won't persist across visits
      }
    };
    recordVisit();
    const interval = setInterval(recordVisit, 5 * 60_000);
    return () => clearInterval(interval);
  }, []);

  // Wall and Triage share one PlicaCompanySlot per company (it owns the
  // single usePlicaCompanyData poll). Triage ordering needs a per-company
  // "actionable" summary, but the page itself never calls the data hook —
  // so each slot reports its own summary up via this callback, and the
  // page just orders by whatever it's been told so far. Simplest correct
  // approach that avoids a second poll or lifting the hook itself.
  const [actionableByCompany, setActionableByCompany] = useState<Record<string, PlicaActionable>>({});
  const handleActionable = useCallback((companyId: string, actionable: PlicaActionable) => {
    setActionableByCompany((prev) => {
      const existing = prev[companyId];
      if (existing && existing.criticalOrHigh === actionable.criticalOrHigh && existing.count === actionable.count) {
        return prev;
      }
      return { ...prev, [companyId]: actionable };
    });
  }, []);
  // The ["companies"] cache entry is shared app-wide and holds a CompanyListResult,
  // not a bare array — reusing its canonical query options keeps the shape intact.
  const companiesQuery = useQuery(companiesListQueryOptions);
  const activeCompanies = (companiesQuery.data?.companies ?? []).filter((company) => company.status !== "archived");

  const [sortMode, setSortMode] = useState<PlicaSortMode>(() =>
    normalizeSortMode(typeof localStorage === "undefined" ? null : localStorage.getItem(PLICA_SORT_STORAGE_KEY)),
  );
  const selectSortMode = (mode: PlicaSortMode) => {
    setSortMode(mode);
    try {
      localStorage.setItem(PLICA_SORT_STORAGE_KEY, mode);
    } catch {
      // storage unavailable (private mode) — sort still applies for this session
    }
  };
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  // Base order = the user's sidebar company-switcher drag order (shared curation).
  const { orderedCompanies } = useCompanyOrder({
    companies: activeCompanies,
    userId: session?.user?.id ?? session?.session?.userId ?? null,
  });
  const hotIds = useMemo(
    () =>
      new Set(
        orderedCompanies
          .filter((company) => actionableByCompany[company.id]?.criticalOrHigh)
          .map((company) => company.id),
      ),
    [orderedCompanies, actionableByCompany],
  );
  const companies = useMemo(
    () => (sortMode === "hot" ? partitionHotFirst(orderedCompanies, hotIds) : orderedCompanies),
    [sortMode, orderedCompanies, hotIds],
  );
  // Pinned companies are hoisted, not duplicated: the bar shows them and the
  // wall below does not, so each company occupies exactly one place.
  const pinnedCompanies = useMemo(
    () => companies.filter((company) => pinnedIds.includes(company.id)),
    [companies, pinnedIds],
  );
  const workspaceCompanies = useMemo(
    () => companies.filter((company) => !pinnedIds.includes(company.id)),
    [companies, pinnedIds],
  );

  const summaries = useQueries({
    queries: companies.map((company) => ({
      queryKey: queryKeys.plica.summary(company.id),
      queryFn: () => dashboardApi.summary(company.id),
      refetchInterval: plicaRefetchInterval,
      refetchIntervalInBackground: true,
    })),
  });
  const loaded = summaries
    .map((query) => query.data)
    .filter((summary): summary is DashboardSummary => summary !== undefined);
  const totalRunning = loaded.reduce((sum, summary) => sum + summary.agents.running, 0);
  const totalApprovals = loaded.reduce((sum, summary) => sum + summary.pendingApprovals, 0);
  const anyStale = summaries.some((query) => query.isError && query.dataUpdatedAt > 0);

  const orderedTriageCompanies = useMemo(
    () =>
      orderTriageCompanies(
        companies.map((company) => ({
          company,
          actionable: actionableByCompany[company.id] ?? { criticalOrHigh: false, count: 0 },
        })),
      ).map((entry) => entry.company),
    [companies, actionableByCompany],
  );

  return (
    <div
      ref={rootRef}
      className={cn("space-y-4", isKiosk && "plica-kiosk bg-background p-4")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-[length:var(--plica-fs-title,20px)] leading-[1.3] font-semibold tracking-tight">Plica</h1>
          <span className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">all companies</span>
        </div>
        <div
          role="group"
          aria-label="Layout columns"
          className="flex items-center rounded-md border p-0.5"
        >
          {LAYOUT_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={layout === mode}
              onClick={() => selectLayout(mode)}
              className={cn(
                "rounded px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]",
                layout === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="View mode" className="flex items-center rounded-md border p-0.5">
          {VIEW_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => selectView(mode)}
              className={cn(
                "rounded px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]",
                view === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Attention rows" className="flex items-center rounded-md border p-0.5">
          {ROW_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={rowMode === mode}
              onClick={() => selectRowMode(mode)}
              className={cn(
                "rounded px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]",
                rowMode === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Pane order" className="flex items-center rounded-md border p-0.5">
          {(["manual", "hot"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={sortMode === mode}
              onClick={() => selectSortMode(mode)}
              className={cn(
                "rounded px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]",
                sortMode === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "manual" ? "Manual" : "Hot first"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">
          <span className="tabular-nums">{totalRunning} running</span>
          {totalApprovals > 0 ? (
            <button
              type="button"
              onClick={() => selectView("triage")}
              title="Show triage view"
              className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] tabular-nums text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
            >
              {totalApprovals} approval{totalApprovals === 1 ? "" : "s"} pending
            </button>
          ) : (
            <span className="tabular-nums">0 approvals pending</span>
          )}
          {anyStale && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" /> polling degraded
            </span>
          )}
          {view === "wall" && (
            <>
              <button
                type="button"
                aria-label="Dock all companies"
                title="Dock all companies"
                disabled={
                  workspaceCompanies.length === 0 ||
                  workspaceCompanies.every((company) => collapsedIds.includes(company.id))
                }
                onClick={() => setCollapsedAll(workspaceCompanies.map((company) => company.id))}
                className="rounded-md border p-1 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <FoldVertical className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Undock all companies"
                title="Undock all companies"
                disabled={collapsedIds.length === 0}
                onClick={() => setCollapsedAll([])}
                className="rounded-md border p-1 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <UnfoldVertical className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            aria-pressed={alertsEnabled}
            aria-label={alertsEnabled ? "Disable alerts" : "Enable alerts"}
            onClick={toggleAlerts}
            className={cn(
              "rounded-md border p-1",
              alertsEnabled ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {alertsEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            aria-label={isKiosk ? "Exit kiosk mode" : "Enter kiosk mode"}
            onClick={toggleKiosk}
            className="rounded-md border p-1 text-muted-foreground hover:text-foreground"
          >
            {isKiosk ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {companies.length > 0 && (
        <div data-plica-bar className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Pin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold uppercase tracking-wide text-muted-foreground">
              Pinned
            </span>
            <div
              role="group"
              aria-label="Pinned bar mode"
              className={cn(
                "flex items-center rounded-md border p-0.5",
                pinnedCompanies.length === 0 && "pointer-events-none opacity-40",
              )}
            >
              {BAR_MODES.map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={barMode === mode}
                  onClick={() => selectBarMode(mode)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]",
                    barMode === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground tabular-nums">
              {pinnedCompanies.length} of {companies.length} watched
            </span>
          </div>
          {pinnedCompanies.length === 0 ? (
            <p
              data-plica-bar-empty
              className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground"
            >
              <Pin className="h-3 w-3 shrink-0" />
              Pin a company from any pane below to watch it up here — its attention counts stay visible
              while you work in the rest of the wall.
            </p>
          ) : barMode === "matrix" || barMode === "scoreboard" ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full border-collapse text-[length:var(--plica-fs-body,14px)] leading-[1.45]">
                <thead>
                  <tr>
                    <th className="py-1 pl-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Company
                    </th>
                    {(barMode === "matrix"
                      ? PLICA_ATTENTION_KINDS.map(({ kind, label }) => ({ key: kind, label }))
                      : PLICA_SCOREBOARD_COLUMNS.map((label) => ({ key: label, label }))
                    ).map(({ key, label }) => (
                      <th
                        key={key}
                        className={cn(
                          "py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
                          barMode === "matrix" ? "px-0.5 text-center" : "px-2 text-right",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {pinnedCompanies.map((company) => (
                    <PlicaCompanySlot
                      key={company.id}
                      company={company}
                      view={barMode}
                      onActionable={handleActionable}
                      onStats={handleStats}
                      tokenThresholds={thresholdsFor(tokenSettings, company.id)}
                      alertsEnabled={alertsEnabled}
                      onUnpin={() => togglePinned(company.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : barMode === "tote" ? (
            <>
              {/* Slots render nothing in this mode; they exist to keep each
                  pinned company polling and reporting into statsByCompany. */}
              {pinnedCompanies.map((company) => (
                <PlicaCompanySlot
                  key={company.id}
                  company={company}
                  view="tote"
                  onActionable={handleActionable}
                  onStats={handleStats}
                  alertsEnabled={alertsEnabled}
                />
              ))}
              <PlicaTote
                companies={pinnedCompanies}
                statsById={statsByCompany}
                tokenSettings={tokenSettings}
              />
            </>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {pinnedCompanies.map((company) => (
                <PlicaCompanySlot
                  key={company.id}
                  company={company}
                  view="signal"
                  onActionable={handleActionable}
                  onStats={handleStats}
                  alertsEnabled={alertsEnabled}
                  onUnpin={() => togglePinned(company.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showBriefing && lastVisit && companies.length > 0 && (
        <PlicaBriefing companies={companies} since={lastVisit} onDismiss={() => setBriefingDismissed(true)} />
      )}

      {companiesQuery.isLoading ? (
        <p className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">Loading companies…</p>
      ) : companies.length === 0 ? (
        <p className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">No companies to show.</p>
      ) : view === "wall" ? (
        <>
        {collapsedIds.length > 0 && (
          <div data-docked className="flex flex-wrap items-center gap-1.5">
            <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] uppercase tracking-wide text-muted-foreground">Docked</span>
            {workspaceCompanies
              .filter((company) => collapsedIds.includes(company.id))
              .map((company) => (
                <PlicaDockedTile key={company.id} company={company} onExpand={() => toggleCollapsed(company.id)} />
              ))}
          </div>
        )}
        <div
          data-layout={layout}
          className={cn(
            "grid gap-4",
            isKiosk && "gap-6",
            layout === "1" && "mx-auto w-full max-w-3xl",
            PLICA_LAYOUT_CLASSES[layout],
          )}
        >
          {workspaceCompanies
            .filter((company) => !collapsedIds.includes(company.id))
            .map((company) => (
              <PlicaCompanySlot
                key={company.id}
                company={company}
                view="wall"
                onActionable={handleActionable}
                alertsEnabled={alertsEnabled}
                onToggleCollapse={() => toggleCollapsed(company.id)}
                onTogglePin={() => togglePinned(company.id)}
                rowMode={rowMode}
              />
            ))}
        </div>
        </>
      ) : (
        <div data-view="triage" className="divide-y overflow-hidden rounded-lg border">
          {orderedTriageCompanies
            .filter((company) => !pinnedIds.includes(company.id))
            .map((company) => (
            <PlicaCompanySlot
              key={company.id}
              company={company}
              view="triage"
              onActionable={handleActionable}
              alertsEnabled={alertsEnabled}
              triageOpen={openTriageCompanyId === company.id}
              onTriageToggle={() =>
                setOpenTriageCompanyId((current) => (current === company.id ? null : company.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
