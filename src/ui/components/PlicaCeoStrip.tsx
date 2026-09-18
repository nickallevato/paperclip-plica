import { Crown, HeartOff, HeartPulse } from "lucide-react";
import type { Agent, Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import {
  deriveCeoHeartbeat,
  intervalLabel,
  relativeTimeLabel,
  selectCeo,
  type PlicaCeoHeartbeatState,
} from "../lib/plica";
import { PlicaLink } from "./PlicaLink";

/**
 * Heartbeat is a two-state fact — beating or not — so it is drawn, not
 * spelled out. "heartbeat off" spent a third of the row's width restating
 * what a struck-through heart says at a glance, and the detail (last beat,
 * cadence) is a hover away rather than gone.
 */
const BEAT_ICON: Record<PlicaCeoHeartbeatState, typeof HeartPulse> = {
  ok: HeartPulse,
  overdue: HeartPulse,
  off: HeartOff,
};

const BEAT_TONE: Record<PlicaCeoHeartbeatState, string> = {
  ok: "text-muted-foreground",
  overdue: "text-plica-wait",
  off: "text-muted-foreground/40",
};

export function PlicaCeoStrip({ agents, company }: { agents: Agent[]; company: Company }) {
  const ceo = selectCeo(agents);
  if (!ceo) return null;
  const now = Date.now();
  const beat = deriveCeoHeartbeat(ceo, now);
  const interval = intervalLabel(beat.intervalSec);
  const Beat = BEAT_ICON[beat.state];
  const beatLabel =
    beat.state === "off"
      ? "Heartbeat off"
      : `Heartbeat ${beat.state === "overdue" ? "overdue" : "ok"} — last beat ${
          beat.lastBeatAt ? relativeTimeLabel(beat.lastBeatAt, now) : "never"
        }${interval ? ` · ${interval}` : ""}`;

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
      <PlicaLink
        to={`/${company.issuePrefix}/agents/${ceo.urlKey ?? ceo.id}`}
        companyId={company.id}
        title={`${ceo.name} · ${beatLabel}`}
        className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground"
      >
        <Crown className="h-3 w-3 shrink-0" />
        <span className="truncate font-medium text-foreground/80">{ceo.name}</span>
        <span data-ceo-beat={beat.state} aria-label={beatLabel} className={cn("shrink-0", BEAT_TONE[beat.state])}>
          <Beat className="h-3 w-3" />
        </span>
      </PlicaLink>
    </span>
  );
}
