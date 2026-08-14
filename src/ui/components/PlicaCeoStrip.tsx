import { Crown } from "lucide-react";
import type { Agent, Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import {
  deriveCeoHeartbeat,
  intervalLabel,
  relativeTimeLabel,
  selectCeo,
} from "../lib/plica";
import { PlicaCeoNudge } from "./PlicaCeoNudge";
import { PlicaLink } from "./PlicaLink";

const BEAT_CLASSES: Record<string, string> = {
  ok: "bg-emerald-500",
  overdue: "bg-amber-500",
  off: "bg-muted-foreground/40",
};

export function PlicaCeoStrip({
  agents,
  company,
  onActed,
}: {
  agents: Agent[];
  company: Company;
  onActed: () => void;
}) {
  const ceo = selectCeo(agents);
  if (!ceo) return null;
  const now = Date.now();
  const beat = deriveCeoHeartbeat(ceo, now);
  const interval = intervalLabel(beat.intervalSec);

  // Unified command header: a borderless second header line, not a boxed chit —
  // it reads as part of the pane's masthead ("who's in charge"), with the
  // vitals grid below as the only boxed row.
  return (
    <div className="-mt-1 flex items-center gap-2 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">
      <PlicaLink to={`/${company.issuePrefix}/agents/${ceo.urlKey ?? ceo.id}`} companyId={company.id} className="flex min-w-0 flex-1 items-center gap-1.5 hover:text-foreground">
        <Crown className="h-3 w-3 shrink-0" />
        <span className="truncate font-medium text-foreground/80">{ceo.name}</span>
        <span
          data-ceo-beat={beat.state}
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", BEAT_CLASSES[beat.state])}
        />
        <span className="min-w-0 flex-1 truncate">
          {beat.state === "off"
            ? "heartbeat off"
            : `beat ${beat.lastBeatAt ? relativeTimeLabel(beat.lastBeatAt, now) : "never"}${interval ? ` · ${interval}` : ""}`}
        </span>
      </PlicaLink>
      <PlicaCeoNudge company={company} ceo={ceo} onActed={onActed} />
    </div>
  );
}
