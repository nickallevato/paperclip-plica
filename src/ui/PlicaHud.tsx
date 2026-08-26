import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, Layers, Maximize, Minimize, Settings, TriangleAlert } from "lucide-react";
import { authApi } from "./host/api";
import { companiesListQueryOptions } from "./host/companies-query";
import { useBreadcrumbs } from "./host/shims";
import { useCompanyOrder } from "./host/useCompanyOrder";
import { countCapacity, deriveCapacity } from "./lib/capacity";
import { releaseStrandedPointerEvents } from "./lib/drafts";
import { PlicaBoardPage } from "./components/PlicaBoardPage";
import { PlicaBriefing } from "./components/PlicaBriefing";
import { PlicaTokenSettingsPanel } from "./components/PlicaTokenSettings";
import type { PlicaCompanyData } from "./components/usePlicaCompanyData";
import { PLICA_QUEUE_GROUPING_STORAGE_KEY, normalizeQueueGrouping, type PlicaQueueGrouping } from "./lib/queue";
import { cn, queryKeys } from "./host/util";
import {
  PLICA_ALERTS_STORAGE_KEY,
  PLICA_LAST_VISIT_STORAGE_KEY,
  PLICA_PINNED_STORAGE_KEY,
  PLICA_SORT_STORAGE_KEY,
  PLICA_TOKEN_THRESHOLDS_STORAGE_KEY,
  normalizeAlertsEnabled,
  normalizePinnedIds,
  normalizeSortMode,
  normalizeTokenSettings,
  PLICA_FREEZE,
  deriveHeat,
  thresholdsFor,
  tokenState,
  plicaRefetchInterval,
  shouldShowBriefing,
  type PlicaActionable,
  type PlicaCompanyStats,
  type PlicaSortMode,
} from "./lib/plica";

/** Preferences the retired classic views persisted; cleared once so they don't linger. */
const LEGACY_STORAGE_KEYS = ["plica.layout", "plica.view", "plica.rows", "plica.bar", "plica.collapsed"];

/** Read a persisted preference, tolerating no storage at all (SSR, private mode). */
function readStored(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a persisted preference; a failure just means it lasts the session. */
function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode) — the choice still applies for this session
  }
}

/**
 * Plica: the Queue + Board page. One header (totals, settings, alerts,
 * kiosk), then the board — the "Needs you" rail, the company ledger and the
 * cross-company lists — with the "since you last looked" briefing as the
 * rail's footer.
 */
export function PlicaHud() {
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Plica" }]);
  }, [setBreadcrumbs]);
  useEffect(() => {
    try {
      for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
    } catch {
      // storage unavailable — nothing to clean
    }
  }, []);

  // Watched companies sort to the top of the board. Persisted per browser.
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => normalizePinnedIds(readStored(PLICA_PINNED_STORAGE_KEY)));
  const togglePinned = (companyId: string) => {
    const next = pinnedIds.includes(companyId) ? pinnedIds.filter((id) => id !== companyId) : [...pinnedIds, companyId];
    setPinnedIds(next);
    writeStored(PLICA_PINNED_STORAGE_KEY, JSON.stringify(next));
  };

  // Each company's slot owns the one data poll and reports up: a compact
  // stats summary, an "actionable" summary, and the whole data bundle the
  // board derives the rail and lists from.
  const [statsByCompany, setStatsByCompany] = useState<Record<string, PlicaCompanyStats | undefined>>({});
  const handleStats = useCallback((companyId: string, stats: PlicaCompanyStats) => {
    setStatsByCompany((current) => ({ ...current, [companyId]: stats }));
  }, []);
  const [dataByCompany, setDataByCompany] = useState<Record<string, PlicaCompanyData | undefined>>({});
  const handleData = useCallback((companyId: string, data: PlicaCompanyData) => {
    setDataByCompany((current) => (current[companyId] === data ? current : { ...current, [companyId]: data }));
  }, []);
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

  const [queueGrouping, setQueueGrouping] = useState<PlicaQueueGrouping>(() =>
    normalizeQueueGrouping(readStored(PLICA_QUEUE_GROUPING_STORAGE_KEY)),
  );
  const selectQueueGrouping = (grouping: PlicaQueueGrouping) => {
    setQueueGrouping(grouping);
    writeStored(PLICA_QUEUE_GROUPING_STORAGE_KEY, grouping);
  };

  const [tokenSettings, setTokenSettings] = useState(() => normalizeTokenSettings(readStored(PLICA_TOKEN_THRESHOLDS_STORAGE_KEY)));
  const [tokenSettingsOpen, setTokenSettingsOpen] = useState(false);
  const persistTokenSettings = (next: typeof tokenSettings) => {
    setTokenSettings(next);
    writeStored(PLICA_TOKEN_THRESHOLDS_STORAGE_KEY, JSON.stringify(next));
  };

  const [sortMode, setSortMode] = useState<PlicaSortMode>(() => normalizeSortMode(readStored(PLICA_SORT_STORAGE_KEY)));
  const selectSortMode = (mode: PlicaSortMode) => {
    setSortMode(mode);
    writeStored(PLICA_SORT_STORAGE_KEY, mode);
  };

  // Kiosk mode: fullscreens the HUD root and bumps the type scale. Not
  // persisted — always starts off; `fullscreenchange` is the source of truth
  // since fullscreen can also be exited via Esc or browser chrome.
  const rootRef = useRef<HTMLDivElement>(null);
  // Last line of defence: whatever happened inside the HUD, navigating away
  // from it must not leave the host's own chrome unable to take a click.
  useEffect(() => () => void releaseStrandedPointerEvents(), []);
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
  // Plica's type scale: every size is written as
  // text-[length:var(--plica-fs-*,<default>)]. Desk tracks the host app
  // (micro = --text-micro, body = text-sm, stat = text-base); kiosk is ~1.3x
  // for a TV across the room. Set on the document root so portaled dialogs
  // inherit too; nothing outside Plica reads these vars.
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

  // Alerts: off by default, persisted; enabling asks for Notification
  // permission only while it is still undecided.
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() => normalizeAlertsEnabled(readStored(PLICA_ALERTS_STORAGE_KEY)));
  const toggleAlerts = () => {
    const next = !alertsEnabled;
    setAlertsEnabled(next);
    writeStored(PLICA_ALERTS_STORAGE_KEY, next ? "on" : "off");
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };

  // Briefing: read the previous visit timestamp on mount (before overwriting
  // it); the strip shows until dismissed for this visit. `plica.lastVisit` is
  // refreshed on mount and every 5 minutes so a long-lived tab doesn't keep
  // reporting a stale "since" time to itself.
  const [lastVisit] = useState<string | null>(() => readStored(PLICA_LAST_VISIT_STORAGE_KEY));
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const showBriefing = !briefingDismissed && lastVisit !== null && shouldShowBriefing(lastVisit, Date.now());
  useEffect(() => {
    const recordVisit = () => writeStored(PLICA_LAST_VISIT_STORAGE_KEY, new Date().toISOString());
    recordVisit();
    const interval = PLICA_FREEZE ? null : setInterval(recordVisit, 5 * 60_000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  // The ["companies"] cache entry is shared app-wide and holds a
  // CompanyListResult, not a bare array — reusing its canonical query options
  // keeps the shape intact.
  const companiesQuery = useQuery(companiesListQueryOptions);
  const activeCompanies = (companiesQuery.data?.companies ?? []).filter((company) => company.status !== "archived");
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  // Base order = the user's sidebar company-switcher drag order.
  const { orderedCompanies } = useCompanyOrder({
    companies: activeCompanies,
    userId: session?.user?.id ?? session?.session?.userId ?? null,
  });
  // Heat is computed and never drawn: Need-you and Decisions already say
  // whether a company wants you, so a heat mark beside them would restate it.
  // Its job is the row order — the one thing those columns cannot do, because
  // it folds in what none of them show (a silent run, an errored agent, an
  // unreachable company).
  const heatByCompany = useMemo(() => {
    const now = Date.now();
    const heat: Record<string, number> = {};
    for (const company of orderedCompanies) {
      const stats = statsByCompany[company.id];
      const data = dataByCompany[company.id];
      const actionable = actionableByCompany[company.id];
      const tokens = stats?.tokens;
      heat[company.id] = deriveHeat({
        unavailable: data?.unavailable ?? false,
        criticalOrHigh: actionable?.criticalOrHigh ?? false,
        needs: actionable?.count ?? 0,
        oldestMins: stats?.oldestMins ?? null,
        tasksBlocked: stats?.tasksBlocked ?? 0,
        stalled: countCapacity(deriveCapacity(data?.agents ?? [], data?.liveRuns ?? [], now)).stalled,
        agentErrors: data?.summary?.agents.error ?? 0,
        decisionsOpen: data?.needsBreakdown?.decisions ?? 0,
        tokenState: tokens === undefined ? "ok" : tokenState(tokens, thresholdsFor(tokenSettings, company.id)),
      });
    }
    return heat;
  }, [orderedCompanies, statsByCompany, dataByCompany, actionableByCompany, tokenSettings]);
  const companies = useMemo(
    () =>
      sortMode === "hot"
        // Stable: equal-heat companies keep the user's own order, so the board
        // only reshuffles when a company's situation actually changes.
        ? [...orderedCompanies].sort((a, b) => (heatByCompany[b.id] ?? 0) - (heatByCompany[a.id] ?? 0))
        : orderedCompanies,
    [sortMode, orderedCompanies, heatByCompany],
  );
  // Watched first, then the chosen order.
  const boardCompanies = useMemo(
    () => [...companies.filter((company) => pinnedIds.includes(company.id)), ...companies.filter((company) => !pinnedIds.includes(company.id))],
    [companies, pinnedIds],
  );

  // The board's own columns and totals row carry these numbers now, so the
  // header no longer runs its own per-company summary fan-out. `anyStale` is
  // kept from the slots' own reports rather than a second set of queries.
  const anyStale = Object.values(dataByCompany).some((data) => data?.staleSince != null);
  // The rail's own total, so the number up top is the number you find below it.

  return (
    <div ref={rootRef} className={cn("space-y-4", isKiosk && "plica-kiosk bg-background p-4")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-[length:var(--plica-fs-title,20px)] leading-[1.3] font-semibold tracking-tight">Plica</h1>
          <span className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">all companies</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">
          {anyStale && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" /> polling degraded
            </span>
          )}
          <button
            type="button"
            aria-pressed={tokenSettingsOpen}
            aria-label="Token thresholds"
            title="Token thresholds"
            onClick={() => setTokenSettingsOpen((open) => !open)}
            className={cn("rounded-md border p-1", tokenSettingsOpen ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-pressed={alertsEnabled}
            aria-label={alertsEnabled ? "Disable alerts" : "Enable alerts"}
            onClick={toggleAlerts}
            className={cn("rounded-md border p-1", alertsEnabled ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
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

      {tokenSettingsOpen && companies.length > 0 && (
        <PlicaTokenSettingsPanel
          companies={companies}
          statsById={statsByCompany}
          settings={tokenSettings}
          onChange={persistTokenSettings}
          onClose={() => setTokenSettingsOpen(false)}
        />
      )}

      {companiesQuery.isLoading ? (
        <p className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">Loading companies…</p>
      ) : companies.length === 0 ? (
        <p className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">No companies to show.</p>
      ) : (
        <PlicaBoardPage
          companies={boardCompanies}
          pinnedIds={pinnedIds}
          onTogglePin={togglePinned}
          dataByCompany={dataByCompany}
          statsByCompany={statsByCompany}
          actionableByCompany={actionableByCompany}
          tokenSettings={tokenSettings}
          alertsEnabled={alertsEnabled}
          onActionable={handleActionable}
          onStats={handleStats}
          onData={handleData}
          sortMode={sortMode}
          onSortMode={selectSortMode}
          grouping={queueGrouping}
          onGrouping={selectQueueGrouping}
          footer={
            showBriefing && lastVisit ? (
              <PlicaBriefing companies={companies} since={lastVisit} onDismiss={() => setBriefingDismissed(true)} />
            ) : undefined
          }
        />
      )}
    </div>
  );
}
