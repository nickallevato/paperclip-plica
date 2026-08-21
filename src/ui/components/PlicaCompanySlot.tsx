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
  type PlicaTokenThresholds,
} from "../lib/plica";
import { PlicaBoardRow } from "./PlicaBoardRow";
import { usePlicaAlerts } from "./usePlicaAlerts";
import { usePlicaCompanyData, type PlicaCompanyData } from "./usePlicaCompanyData";

/**
 * One slot per company: owns the single usePlicaCompanyData(company.id) poll,
 * renders the company's board row, and reports what the page needs from it
 * (stats, the actionable summary, the whole data bundle) upward — the page
 * derives the cross-company rail and lists from those reports rather than
 * polling again.
 */
export function PlicaCompanySlot({
  company,
  onActionable,
  alertsEnabled = false,
  onTogglePin,
  onStats,
  onData,
  tokenThresholds,
  pinned = false,
  onFocusNeeds,
  needsFocused = false,
}: {
  company: Company;
  onActionable?: (companyId: string, actionable: PlicaActionable) => void;
  alertsEnabled?: boolean;
  /** Watched companies sort to the top of the board. */
  onTogglePin?: () => void;
  onStats?: (companyId: string, stats: PlicaCompanyStats) => void;
  /**
   * Fires only when a query's data actually changes (react-query keeps
   * references stable across polls), never on every render.
   */
  onData?: (companyId: string, data: PlicaCompanyData) => void;
  tokenThresholds?: PlicaTokenThresholds;
  pinned?: boolean;
  /** Filter the queue rail to this company (toggle). */
  onFocusNeeds?: () => void;
  needsFocused?: boolean;
}) {
  const data = usePlicaCompanyData(company.id);
  const ceoOverdue = deriveCeoHeartbeat(selectCeo(data.agents), Date.now()).state === "overdue";
  const actionable = deriveActionable({ approvals: data.approvals, attention: data.attention, ceoOverdue });

  // An unavailable company must alert as red too (never alert an unreachable
  // company as healthy).
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary, data.attention);
  const criticalAttentionIds = (data.attention?.items ?? [])
    .filter((item) => !item.dismissal && item.severity === "critical")
    .map((item) => item.id);
  // Withhold the snapshot until data has actually arrived — see usePlicaAlerts:
  // baselining a placeholder would turn every pre-existing red/critical/
  // overdue condition into a "new" edge on the first real poll.
  const dataReady = !data.isLoading && data.summary !== undefined;
  const alertSnapshot: PlicaAlertSnapshot | null = dataReady ? { health, criticalAttentionIds, ceoOverdue } : null;
  const pulse = usePlicaAlerts(company.name, alertsEnabled, alertSnapshot);

  // Effects, not inline calls: a parent state setter must not run during this
  // component's render. Each depends on the values, not the rebuilt objects.
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
  useEffect(() => {
    onStats?.(company.id, stats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    company.id,
    stats.running, stats.active, stats.tasks, stats.needs, stats.critical,
    stats.failed, stats.oldestMins, stats.inbox, stats.tokens, stats.unavailable,
    stats.routines, stats.routinesOverdue, stats.routinesFailing,
  ]);

  useEffect(() => {
    onData?.(company.id, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    company.id,
    data.summary, data.liveRuns, data.projects, data.issues, data.agents, data.approvals,
    data.badges, data.attention, data.routines, data.tokens, data.isLoading, data.unavailable, data.staleSince,
  ]);

  return (
    <PlicaBoardRow
      company={company}
      data={data}
      stats={stats}
      actionable={actionable}
      thresholds={tokenThresholds ?? PLICA_TOKEN_DEFAULTS}
      pulse={pulse}
      pinned={pinned}
      onTogglePin={onTogglePin}
      onFocusNeeds={onFocusNeeds}
      needsFocused={needsFocused}
      nowMs={Date.now()}
    />
  );
}
