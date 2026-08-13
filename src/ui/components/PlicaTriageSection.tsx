import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { AttentionItem, Company } from "@paperclipai/shared";
import { CompanyPatternIcon } from "../host/ui-kit";
import { toCompanyRelativePath } from "../host/util";
import { cn } from "../host/util";
import {
  attentionDetailText,
  deriveCeoHeartbeat,
  deriveTriageSummary,
  selectCeo,
} from "../lib/plica";
import { PlicaApprovalRow } from "./PlicaApprovalRow";
import { PlicaAttentionCard } from "./PlicaAttentionCard";
import { PlicaCeoNudge } from "./PlicaCeoNudge";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

const TONE_CLASSES: Record<string, string> = {
  critical: "font-semibold text-red-600 dark:text-red-400",
  warn: "text-amber-700 dark:text-amber-300",
  muted: "text-muted-foreground",
};

const KIND_LABELS: Partial<Record<AttentionItem["sourceKind"], string>> = {
  blocker_attention: "blocker",
  failed_run: "run",
  budget_alert: "budget",
  agent_error_alert: "agent",
  approval: "approval",
  review: "review",
  join_request: "join",
};

/**
 * One accordion row of the calm triage list: a quiet summary line per
 * company at rest; expanded (one at a time, page-controlled) it shows a
 * flat, uniform item list — kind label, one line of text, one action.
 */
export function PlicaTriageSection({
  company,
  data,
  open,
  onToggle,
}: {
  company: Company;
  data: PlicaCompanyData;
  open: boolean;
  onToggle: () => void;
}) {
  const undismissedAttention = (data.attention?.items ?? []).filter((item) => !item.dismissal);
  const ceo = selectCeo(data.agents);
  const ceoOverdue = deriveCeoHeartbeat(ceo, Date.now()).state === "overdue";
  const summary = deriveTriageSummary({
    approvalCount: data.approvals.length,
    attention: data.attention,
    ceoOverdue,
  });
  const isClear = summary.length === 0;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section className={cn(open && "bg-muted/20")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <CompanyPatternIcon
          companyName={company.name}
          logoUrl={company.logoUrl}
          brandColor={company.brandColor}
          className="size-5 shrink-0 rounded-md text-[8px]"
        />
        <h2 className="truncate text-[length:var(--plica-fs-stat,0.875rem)] font-semibold">{company.name}</h2>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[length:var(--plica-fs-body,0.75rem)]">
          {data.unavailable ? (
            <span className={TONE_CLASSES.critical}>unreachable</span>
          ) : isClear ? (
            <span className="text-emerald-600 dark:text-emerald-400">clear</span>
          ) : (
            summary.map((part, index) => (
              <span key={part.label} className={TONE_CLASSES[part.tone]}>
                {index > 0 && <span className="text-muted-foreground/50">· </span>}
                {part.label}
              </span>
            ))
          )}
        </span>
      </button>

      {open && (
        <div className="space-y-0.5 px-3 pb-3 pl-[52px]">
          {data.unavailable ? (
            <p className="text-[length:var(--plica-fs-body,0.75rem)] text-muted-foreground">This company's data could not be loaded. It will retry automatically.</p>
          ) : isClear ? (
            <p className="text-[length:var(--plica-fs-body,0.75rem)] text-muted-foreground">Nothing actionable — all clear.</p>
          ) : (
            <>
              {data.approvals.map((approval) => (
                <TriageItem key={approval.id} kind="approval">
                  <PlicaApprovalRow approval={approval} company={company} onActed={data.invalidate} />
                </TriageItem>
              ))}
              {undismissedAttention.length > 0 && (
                <ul className="space-y-1.5">
                  {undismissedAttention.map((item) => (
                    <PlicaAttentionCard key={item.id} item={item} company={company} />
                  ))}
                </ul>
              )}
              {ceoOverdue && ceo && (
                <TriageItem kind="beat">
                  <span className="min-w-0 flex-1 truncate text-[length:var(--plica-fs-body,0.75rem)]">
                    <span className="font-medium">{ceo.name}</span>
                    <span className="text-muted-foreground"> — heartbeat overdue</span>
                  </span>
                  <PlicaCeoNudge company={company} ceo={ceo} onActed={data.invalidate} />
                </TriageItem>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function TriageItem({ kind, children }: { kind: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-14 shrink-0 text-[length:var(--plica-fs-micro,10px)] uppercase tracking-wide text-muted-foreground">{kind}</span>
      {children}
    </div>
  );
}
