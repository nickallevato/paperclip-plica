import {
  CircleDollarSign,
  CircleHelp,
  Eye,
  Gavel,
  Info,
  LifeBuoy,
  ListChecks,
  OctagonAlert,
  OctagonX,
  SquareCheckBig,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import type { AttentionItem } from "@paperclipai/shared";
import { cn } from "../host/util";

/**
 * One icon per attention kind, shared by every surface that shows kinds —
 * the bar's Signal cells, the Matrix heatmap, and the attention cards in the
 * panes. Kept in one place so a kind never picks up a second icon.
 */
const KIND_ICONS: Record<AttentionItem["sourceKind"], typeof Info> = {
  approval: SquareCheckBig,
  decision: Gavel,
  issue_thread_interaction: CircleHelp,
  join_request: UserPlus,
  recovery_action: LifeBuoy,
  productivity_review: ListChecks,
  blocker_attention: OctagonAlert,
  review: Eye,
  failed_run: OctagonX,
  budget_alert: CircleDollarSign,
  agent_error_alert: TriangleAlert,
};

export function PlicaKindGlyph({
  kind,
  className,
}: {
  kind: AttentionItem["sourceKind"];
  className?: string;
}) {
  const Icon = KIND_ICONS[kind] ?? Info;
  return <Icon aria-hidden className={cn("h-3 w-3 shrink-0", className)} />;
}
