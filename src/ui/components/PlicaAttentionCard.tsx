import {
  CircleDollarSign,
  CircleHelp,
  ExternalLink,
  Eye,
  Info,
  ListChecks,
  OctagonAlert,
  OctagonX,
  SquareCheckBig,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import type { AttentionItem, Company } from "@paperclipai/shared";
import { toCompanyRelativePath } from "../host/util";
import { cn } from "../host/util";
import { priorityColor } from "../host/util";
import { attentionDetailText, relativeTimeLabel } from "../lib/plica";
import { PlicaIssueHover } from "./PlicaIssueHover";
import { PlicaLink } from "./PlicaLink";

const KIND_ICONS: Partial<Record<AttentionItem["sourceKind"], typeof Info>> = {
  approval: SquareCheckBig,
  issue_thread_interaction: CircleHelp,
  join_request: UserPlus,
  blocker_attention: OctagonAlert,
  review: Eye,
  failed_run: OctagonX,
  budget_alert: CircleDollarSign,
  agent_error_alert: TriangleAlert,
  productivity_review: ListChecks,
};

const KIND_META: Partial<Record<AttentionItem["sourceKind"], string>> = {
  approval: "approval",
  issue_thread_interaction: "needs answer",
  join_request: "join request",
  blocker_attention: "blocker",
  review: "review",
  failed_run: "failed run",
  budget_alert: "budget",
  agent_error_alert: "agent error",
  productivity_review: "productivity",
};

/**
 * One attention item as a subtle mini-card: kind icon (severity-colored via
 * the app's canonical priority palette), the actual ask as primary text,
 * micro meta-line beneath. When the item links somewhere the whole card is
 * the click target. Used by both the wall pane's attention section and the
 * triage accordion.
 */
export function PlicaAttentionCard({ item, company }: { item: AttentionItem; company: Company }) {
  const Icon = KIND_ICONS[item.sourceKind] ?? Info;
  const detail = attentionDetailText(item.detail);
  const primary = detail ?? item.whyNow;
  const subject = item.subject;
  const href = subject.href ? `/${company.issuePrefix}${toCompanyRelativePath(subject.href)}` : null;
  const when = item.activityAt ? relativeTimeLabel(new Date(item.activityAt).toISOString(), Date.now()) : null;

  const inner = (
    <>
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          // Severity rides the app's priority palette so the operator's trained
          // color scale carries over 1:1.
          priorityColor[item.severity] ?? "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[length:var(--plica-fs-body,0.75rem)] leading-snug">{primary}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[length:var(--plica-fs-body,0.75rem)] text-muted-foreground">
          {item.severity === "critical" && (
            <span className="shrink-0 rounded-sm bg-red-600 px-1 text-[length:var(--plica-fs-micro,10px)] font-semibold uppercase leading-4 text-white">
              crit
            </span>
          )}
          <span className="shrink-0">{KIND_META[item.sourceKind] ?? item.sourceKind}</span>
          {subject.identifier && <span className="shrink-0 font-mono">{subject.identifier}</span>}
          {subject.kind === "issue" && subject.title && subject.title !== primary && (
            <span className="min-w-0 truncate">{subject.title}</span>
          )}
          {when && <span className="shrink-0">{when}</span>}
          {href && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
              Open <ExternalLink className="h-2.5 w-2.5" />
            </span>
          )}
        </p>
      </div>
    </>
  );

  // Whole-card navigation when the item links somewhere; the "Open" affordance
  // in the meta line stays as a visual cue but is part of the same link.
  const content = href ? (
    <PlicaLink to={href} companyId={company.id} className="flex w-full items-start gap-2 px-2 py-1.5 hover:bg-muted/40">
      {inner}
    </PlicaLink>
  ) : (
    <div className="flex w-full items-start gap-2 px-2 py-1.5">{inner}</div>
  );

  return (
    <li
      className={cn(
        "overflow-hidden rounded-md border bg-muted/20",
        item.severity === "critical" && "border-red-500/40 bg-red-500/10",
        item.severity === "high" && "border-orange-500/30",
      )}
    >
      {subject.kind === "issue" ? (
        <PlicaIssueHover issueId={subject.id} anchorClassName="min-w-0">
          {content}
        </PlicaIssueHover>
      ) : (
        content
      )}
    </li>
  );
}
