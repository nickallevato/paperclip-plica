import { useEffect } from "react";
import type { Company } from "@paperclipai/shared";
import {
  deriveCeoHeartbeat,
  derivePaneHealth,
  selectCeo,
  deriveActionable,
  type PlicaActionable,
  type PlicaAlertSnapshot,
  PLICA_TOKEN_DEFAULTS,
  deriveCompanyStats,
  type PlicaCompanyStats,
  type PlicaRowMode,
  type PlicaSlotPresentation,
  type PlicaTokenThresholds,
} from "../lib/plica";
import { PlicaCompanyPane } from "./PlicaCompanyPane";
import { PlicaAnalyticPane } from "./PlicaAnalyticPane";
import { PlicaMatrixRow } from "./PlicaMatrixRow";
import { PlicaScoreboardRow } from "./PlicaScoreboardRow";
import { PlicaSignalCard } from "./PlicaSignalCard";
import { PlicaTriageSection } from "./PlicaTriageSection";
import { usePlicaAlerts } from "./usePlicaAlerts";
import { usePlicaCompanyData } from "./usePlicaCompanyData";

/**
 * Hoists the single usePlicaCompanyData(company.id) poll above both the
 * Wall (pane) and Triage (section) presentations, so switching view modes
 * never re-fetches — React Query dedupes the shared query keys, but only
 * if the same hook call site keeps subscribing across renders/views. The
 * page renders one slot per company regardless of the active view and
 * lets CSS/layout, not remounting, decide what's shown.
 */
export function PlicaCompanySlot({
  company,
  view,
  onActionable,
  alertsEnabled = false,
  triageOpen = false,
  onTriageToggle = () => undefined,
  onToggleCollapse,
  onUnpin,
  onTogglePin,
  onStats,
  tokenThresholds,
  rowMode,
}: {
  company: Company;
  view: PlicaSlotPresentation;
  onActionable?: (companyId: string, actionable: PlicaActionable) => void;
  alertsEnabled?: boolean;
  triageOpen?: boolean;
  onTriageToggle?: () => void;
  onToggleCollapse?: () => void;
  /** Present when this company is pinned to the bar. */
  onUnpin?: () => void;
  /** Pins this company up into the bar, hoisting it out of the workspace. */
  onTogglePin?: () => void;
  /**
   * Reports this company's compact stats up to the page, the same way
   * onActionable does — the bar's cross-company modes (Scoreboard, Tote) lay
   * companies side by side or add them together, which no single slot can do.
   */
  onStats?: (companyId: string, stats: PlicaCompanyStats) => void;
  /** Only needed by the presentations that colour a token count. */
  tokenThresholds?: PlicaTokenThresholds;
  /** How attention items render inside the pane presentation. */
  rowMode?: PlicaRowMode;
}) {
  const data = usePlicaCompanyData(company.id);
  const ceoOverdue = deriveCeoHeartbeat(selectCeo(data.agents), Date.now()).state === "overdue";
  const actionable = deriveActionable({ approvals: data.approvals, attention: data.attention, ceoOverdue });

  // An unavailable pane must alert as red too, matching the pane's own
  // health-override rule (never render/alert an unreachable pane as healthy).
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary, data.attention);
  const criticalAttentionIds = (data.attention?.items ?? [])
    .filter((item) => !item.dismissal && item.severity === "critical")
    .map((item) => item.id);
  // Withhold the snapshot (rather than reporting a green/empty placeholder)
  // until the pane's data has actually arrived — see usePlicaAlerts for why:
  // baselining a placeholder would turn every pre-existing red/critical/
  // overdue condition into a "new" edge on the very first real poll.
  const dataReady = !data.isLoading && data.summary !== undefined;
  const alertSnapshot: PlicaAlertSnapshot | null = dataReady ? { health, criticalAttentionIds, ceoOverdue } : null;
  const pulse = usePlicaAlerts(company.name, alertsEnabled, alertSnapshot);

  // Reports this company's actionable summary up to the page so it can
  // order the triage list without every slot needing to know about its
  // siblings. Effect (not inline call) because calling a parent state
  // setter during this component's own render would trigger React's
  // "cannot update a component while rendering a different component"
  // warning.
  useEffect(() => {
    onActionable?.(company.id, actionable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, actionable.criticalOrHigh, actionable.count]);

  const stats = deriveCompanyStats({
    summary: data.summary,
    attention: data.attention,
    badges: data.badges,
    tokens: data.tokens,
    routines: data.routines,
    unavailable: data.unavailable,
    nowMs: Date.now(),
  });
  // Same reason as onActionable: a parent setter must not run during this
  // component's render. Depend on the values rather than the object, which is
  // rebuilt every render and would otherwise loop.
  useEffect(() => {
    onStats?.(company.id, stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    company.id,
    stats.running, stats.active, stats.tasks, stats.needs, stats.critical,
    stats.failed, stats.oldestMins, stats.inbox, stats.tokens, stats.unavailable,
    stats.routines, stats.routinesOverdue, stats.routinesFailing,
  ]);

  if (view === "signal") {
    return <PlicaSignalCard company={company} data={data} onUnpin={onUnpin} />;
  }
  if (view === "matrix") {
    return <PlicaMatrixRow company={company} data={data} onUnpin={onUnpin} />;
  }
  if (view === "scoreboard") {
    return (
      <PlicaScoreboardRow
        company={company}
        data={data}
        stats={stats}
        thresholds={tokenThresholds ?? PLICA_TOKEN_DEFAULTS}
        onUnpin={onUnpin}
      />
    );
  }
  // Tote renders from the page's collected stats, so the slot exists only to
  // keep this company polling and reporting.
  if (view === "tote") return null;
  if (view === "analytic") {
    return (
      <PlicaAnalyticPane
        company={company}
        data={data}
        stats={stats}
        thresholds={tokenThresholds ?? PLICA_TOKEN_DEFAULTS}
        onTogglePin={onTogglePin}
      />
    );
  }
  if (view === "triage") {
    return <PlicaTriageSection company={company} data={data} open={triageOpen} onToggle={onTriageToggle} />;
  }
  return (
    <PlicaCompanyPane
      company={company}
      data={data}
      pulse={pulse}
      onToggleCollapse={onToggleCollapse}
      onTogglePin={onTogglePin}
      rowMode={rowMode}
    />
  );
}
