import { useEffect, useRef, useState } from "react";
import { detectAlertEdges, type PlicaAlertEvent, type PlicaAlertSnapshot } from "../lib/plica";

const PULSE_MS = 2_000;

function messageFor(companyName: string, event: PlicaAlertEvent): string {
  switch (event.kind) {
    case "health_red":
      return `${companyName}: health is now red`;
    case "critical_attention":
      return `${companyName}: new critical attention item`;
    case "ceo_overdue":
      return `${companyName}: CEO heartbeat overdue`;
  }
}

/**
 * Edge-detects alert-worthy transitions for one company's pane against the
 * previous poll snapshot (held in a ref — no persistence, no repeats within
 * a session, and the first snapshot ever seen is a silent baseline per
 * detectAlertEdges). When `enabled`, fires one browser Notification per
 * edge (only if permission is already "granted" — this hook never prompts;
 * the global bell toggle owns requesting permission). Returns `pulse`,
 * which flips true for ~2s after any edge so the caller can ring the pane.
 *
 * `snapshot` must be `null` while the pane's data hasn't actually arrived
 * yet (e.g. still loading) — a `null` snapshot is a no-op: it neither
 * baselines nor detects. Without this, a placeholder "green/empty" snapshot
 * would get baselined during load, and the first *real* poll (which may
 * already be red/critical/overdue from before this tab ever opened) would
 * register as a fresh edge and fire a Notification burst for pre-existing
 * conditions. The baseline is taken silently from the first real snapshot.
 */
export function usePlicaAlerts(companyName: string, enabled: boolean, snapshot: PlicaAlertSnapshot | null): boolean {
  const prevRef = useRef<PlicaAlertSnapshot | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (snapshot === null) return;

    const prev = prevRef.current;
    const events = detectAlertEdges(prev, snapshot);
    prevRef.current = snapshot;

    if (events.length === 0) return;

    if (enabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const event of events) {
        new Notification(messageFor(companyName, event));
      }
    }

    setPulse(true);
    const timer = setTimeout(() => setPulse(false), PULSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, enabled, snapshot?.health, snapshot?.ceoOverdue, snapshot?.criticalAttentionIds.join(",")]);

  return pulse;
}
