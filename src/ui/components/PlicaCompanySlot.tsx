import { useEffect } from "react";
import type { Company } from "@paperclipai/shared";
import {
  deriveCeoHeartbeat,
  derivePaneHealth,
  selectCeo,
  deriveActionable,
  type PlicaActionable,
  type PlicaAlertSnapshot,
  type PlicaSlotPresentation,
} from "../lib/plica";
import { PlicaCompanyPane } from "./PlicaCompanyPane";
import { PlicaMatrixRow } from "./PlicaMatrixRow";
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
}) {
  const data = usePlicaCompanyData(company.id);
  const ceoOverdue = deriveCeoHeartbeat(selectCeo(data.agents), Date.now()).state === "overdue";
  const actionable = deriveActionable({ approvals: data.approvals, attention: data.attention, ceoOverdue });

  // An unavailable pane must alert as red too, matching the pane's own
  // health-override rule (never render/alert an unreachable pane as healthy).
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary);
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

  if (view === "signal") {
    return <PlicaSignalCard company={company} data={data} onUnpin={onUnpin} />;
  }
  if (view === "matrix") {
    return <PlicaMatrixRow company={company} data={data} onUnpin={onUnpin} />;
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
    />
  );
}
