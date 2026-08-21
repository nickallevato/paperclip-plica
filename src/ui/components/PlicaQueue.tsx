import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, ExternalLink, HeartPulse, CalendarClock, X } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { Button, CompanyPatternIcon, companyAccentColor } from "../host/ui-kit";
import { cn, toCompanyRelativePath } from "../host/util";
import {
  attentionActionLabel,
  attentionAskText,
  attentionHeadline,
  formatAgeMinutes,
  intervalLabel,
  issueStatusLabel,
  relativeTimeLabel,
} from "../lib/plica";
import {
  PLICA_QUEUE_GROUPINGS,
  ageTone,
  queueItemAgeMinutes,
  type PlicaQueueGroup,
  type PlicaQueueGrouping,
  type PlicaQueueItem,
  type PlicaQueueSummary,
} from "../lib/queue";
import { PlicaCeoNudge } from "./PlicaCeoNudge";
import { PlicaAskBlock, PlicaInteractionActions, hasInlineInteraction } from "./PlicaInteractionActions";
import { PlicaIssueHover } from "./PlicaIssueHover";
import { PlicaKindGlyph } from "./PlicaKindGlyph";
import { PlicaLink } from "./PlicaLink";
import { useApprovalDecision } from "./useApprovalDecision";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";
const BODY = "text-[length:var(--plica-fs-body,14px)] leading-[1.45]";

/** What to call an attention kind on a one-line row. */
const KIND_LABELS: Partial<Record<string, string>> = {
  blocker_attention: "blocked",
  failed_run: "failed run",
  issue_thread_interaction: "question",
  agent_error_alert: "agent error",
  budget_alert: "budget",
  join_request: "join request",
  recovery_action: "recovery",
  productivity_review: "review",
};

const INTERACTION_LABELS: Partial<Record<string, string>> = {
  ask_user_questions: "questions",
  request_confirmation: "confirmation",
  request_checkbox_confirmation: "confirmation",
  suggest_tasks: "suggested tasks",
  request_item_verdicts: "verdicts",
};

function kindLabel(kind: string, interactionKind?: unknown): string {
  if (kind === "issue_thread_interaction" && typeof interactionKind === "string") {
    return INTERACTION_LABELS[interactionKind] ?? KIND_LABELS[kind] ?? kind;
  }
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function Avatar({ company }: { company: Company }) {
  return (
    <CompanyPatternIcon
      companyName={company.name}
      logoUrl={company.logoUrl}
      brandColor={company.brandColor}
      className="mt-0.5 size-5 shrink-0 rounded-md text-[8px]"
    />
  );
}

function ApprovalActions({ item, onActed }: { item: Extract<PlicaQueueItem, { kind: "approval" }>; onActed: () => void }) {
  const decision = useApprovalDecision(item.approval, onActed);
  return (
    <>
      <Button
        size="sm"
        variant="default"
        className={cn("h-6 px-2", MICRO, "font-medium")}
        disabled={decision.busy}
        aria-label="Approve"
        onClick={() => decision.approve()}
      >
        <Check className="mr-0.5 h-3 w-3" /> Approve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={cn("h-6 px-2 text-red-600 dark:text-red-400", MICRO)}
        disabled={decision.busy}
        aria-label="Reject"
        onClick={() => decision.reject()}
      >
        <X className="mr-0.5 h-3 w-3" /> Reject
      </Button>
    </>
  );
}

function OpenLink({ to, companyId, label = "Open" }: { to: string; companyId: string; label?: string }) {
  return (
    <PlicaLink
      to={to}
      companyId={companyId}
      className={cn("inline-flex h-6 items-center gap-1 rounded-md border px-2 text-muted-foreground hover:text-foreground", MICRO)}
    >
      {label} <ExternalLink className="h-3 w-3" />
    </PlicaLink>
  );
}

/**
 * One thing that needs you, on two lines: what it is (identifier + title) and
 * why/when (kind + age), with its single action on the right. Critical rows
 * carry a red edge and tint; anything else in Now carries an amber edge.
 */
export function PlicaQueueItemRow({
  item,
  company,
  nowMs,
  onActed,
}: {
  item: PlicaQueueItem;
  company: Company;
  nowMs: number;
  onActed: () => void;
}) {
  const ageMinutes = queueItemAgeMinutes(item, nowMs);
  const age = formatAgeMinutes(ageMinutes);
  const tone = ageTone(ageMinutes);
  const critical = item.kind === "attention" && item.item.severity === "critical";
  // The edge says *whose* item this is (it matches the company avatar); how
  // urgent it is moves to a mark before the title so the two never compete.
  const edgeColor = companyAccentColor(company.name, company.brandColor);

  let identifier: string | null = null;
  let title: string;
  let meta: ReactNode;
  let actions: ReactNode;
  let hoverIssueId: string | null = null;
  /** The question / prompt itself, when the item carries one. */
  let ask: string | null = null;
  /** Inline resolve controls (confirm / answer), rendered under the ask. */
  let inline: ReactNode = null;

  switch (item.kind) {
    case "approval": {
      title = issueStatusLabel(item.approval.type);
      meta = (
        <>
          <Check className="h-3 w-3 shrink-0" />
          approval{item.requestedBy ? ` · ${item.requestedBy} asks` : ""} · {relativeTimeLabel(new Date(item.approval.createdAt).toISOString(), nowMs)}
        </>
      );
      actions = (
        <>
          <ApprovalActions item={item} onActed={onActed} />
          <PlicaLink
            to={`/${company.issuePrefix}/approvals/${item.approval.id}`}
            companyId={company.id}
            title="Open approval"
            aria-label="Open approval"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
          </PlicaLink>
        </>
      );
      break;
    }
    case "attention": {
      const subject = item.item.subject;
      identifier = subject.identifier ?? item.issue?.identifier ?? null;
      title = attentionHeadline(item.item, item.issue);
      ask = attentionAskText(item.item, title);
      hoverIssueId = subject.kind === "issue" ? subject.id : (item.issue?.id ?? null);
      meta = (
        <>
          <PlicaKindGlyph kind={item.item.sourceKind} />
          <span className="truncate" title={item.item.whyNow}>
            {kindLabel(item.item.sourceKind, item.item.subject.metadata?.kind)}
            {item.item.originAgentName ? ` · ${item.item.originAgentName}` : ""}
          </span>
        </>
      );
      const href = subject.href ? `/${company.issuePrefix}${toCompanyRelativePath(subject.href)}` : `/${company.issuePrefix}/decisions`;
      if (hasInlineInteraction(item.item)) inline = <PlicaInteractionActions item={item.item} onActed={onActed} />;
      actions = inline ? (
        <PlicaLink
          to={href}
          companyId={company.id}
          title="Open thread"
          aria-label="Open thread"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
        </PlicaLink>
      ) : (
        <OpenLink to={href} companyId={company.id} label={attentionActionLabel(item.item)} />
      );
      break;
    }
    case "heartbeat": {
      title = `${item.ceo.name} heartbeat overdue`;
      const interval = intervalLabel(item.beat.intervalSec);
      meta = (
        <>
          <HeartPulse className="h-3 w-3 shrink-0" />
          last beat {item.beat.lastBeatAt ? relativeTimeLabel(item.beat.lastBeatAt, nowMs) : "never"}
          {interval ? ` · expected every ${interval}` : ""}
        </>
      );
      actions = (
        <span className={cn("inline-flex items-center gap-1 rounded-md border pl-2 text-muted-foreground", MICRO)}>
          Nudge
          <PlicaCeoNudge company={company} ceo={item.ceo} onActed={onActed} />
        </span>
      );
      break;
    }
    case "routine":
    default: {
      title = item.routine.title;
      meta = (
        <>
          <CalendarClock className="h-3 w-3 shrink-0" />
          routine · {item.reason === "overdue" ? "scheduled run is overdue" : "last run failed"}
        </>
      );
      actions = <OpenLink to={`/${company.issuePrefix}/routines/${item.routine.id}`} companyId={company.id} />;
      break;
    }
  }

  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className={cn("flex items-baseline gap-1.5", BODY)}>
        {critical ? (
          <AlertTriangle className="h-3 w-3 shrink-0 self-center text-red-600 dark:text-red-400" aria-label="critical" />
        ) : item.bucket === "now" ? (
          <span className="size-1.5 shrink-0 self-center rounded-full bg-amber-500" aria-label="now" />
        ) : null}
        {identifier && (
          <span className={cn("shrink-0 font-mono tabular-nums text-muted-foreground", MICRO)}>{identifier}</span>
        )}
        <span className="min-w-0 truncate" title={title}>
          {title}
        </span>
      </div>
      {ask && (item.kind === "attention" ? <PlicaAskBlock item={item.item} text={ask} /> : (
        <div data-queue-ask className={cn("mt-0.5 rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 px-2 py-1 text-foreground/90", BODY)}>
          <span className="line-clamp-3">{ask}</span>
        </div>
      ))}
      {inline && (
        <div data-queue-inline className="mt-1 flex flex-wrap items-center gap-1.5">
          {inline}
        </div>
      )}
      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-muted-foreground",
          MICRO,
          critical && "text-red-700 dark:text-red-300",
        )}
      >
        {meta}
        <span
          data-age-tone={tone}
          className={cn(
            "ml-auto shrink-0 tabular-nums",
            tone === "stale" && "font-semibold text-red-600 dark:text-red-400",
            tone === "aging" && "font-medium text-amber-700 dark:text-amber-300",
          )}
          title={tone === "stale" ? "waiting a month or more" : tone === "aging" ? "waiting over a week" : undefined}
        >
          {age}
        </span>
      </div>
    </div>
  );

  return (
    <li
      data-queue-item={item.id}
      data-queue-kind={item.kind}
      className={cn("flex items-start gap-2.5 border-l-[3px] py-2 pl-3 pr-3 hover:bg-muted/30", critical && "bg-red-500/[0.08]")}
      style={{ borderLeftColor: edgeColor }}
    >
      <Avatar company={company} />
      {hoverIssueId ? (
        <PlicaIssueHover issueId={hoverIssueId} anchorClassName="flex min-w-0 flex-1">
          {body}
        </PlicaIssueHover>
      ) : (
        body
      )}
      <span className="flex shrink-0 items-center gap-1 self-center">{actions}</span>
    </li>
  );
}

/**
 * The "Needs you" rail: every item across every company, grouped Now / Soon /
 * Later (or by company), each with its action inline. Later starts folded —
 * it is a count you can open, not a list you must read.
 */
export function PlicaQueue({
  groups,
  summary,
  grouping,
  onGrouping,
  companiesById,
  nowMs,
  onActed,
  footer,
  filterCompany,
  onClearFilter,
  homeCompany,
  onFilterCompany,
}: {
  groups: PlicaQueueGroup[];
  summary: PlicaQueueSummary;
  grouping: PlicaQueueGrouping;
  onGrouping: (grouping: PlicaQueueGrouping) => void;
  companiesById: Record<string, Company | undefined>;
  nowMs: number;
  onActed: (companyId: string) => void;
  /** Rendered at the bottom of the rail — the "since you last looked" line. */
  footer?: ReactNode;
  /** When set, the rail shows only this company's items and says so. */
  filterCompany?: Company | null;
  onClearFilter?: () => void;
  /** The company whose page the HUD is on — the "just this one" half of the scope toggle. */
  homeCompany?: Company | null;
  onFilterCompany?: (company: Company) => void;
}) {
  const [laterOpen, setLaterOpen] = useState(false);
  const urgent = summary.now + summary.soon;

  return (
    <aside
      data-plica-queue
      aria-label="Needs you"
      className="flex min-h-0 flex-col rounded-lg border bg-muted/20"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className={cn("font-semibold", BODY)}>Needs you</h2>
        {urgent > 0 ? (
          <span
            className={cn(
              "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 font-semibold tabular-nums text-white",
              MICRO,
              summary.now > 0 ? "bg-red-600" : "bg-amber-600",
            )}
          >
            {urgent}
          </span>
        ) : (
          <span className={cn(MICRO, "text-emerald-600 dark:text-emerald-400")}>clear</span>
        )}
        {summary.oldestMins !== null && (
          <span className={cn(MICRO, "tabular-nums text-muted-foreground")}>oldest {formatAgeMinutes(summary.oldestMins)}</span>
        )}
        {homeCompany && onFilterCompany && (
          <div role="group" aria-label="Queue scope" className="ml-auto flex items-center rounded-md border p-0.5">
            <button
              type="button"
              aria-pressed={!filterCompany}
              onClick={() => onClearFilter?.()}
              className={cn("rounded px-2 py-0.5", MICRO, !filterCompany ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              All
            </button>
            <button
              type="button"
              aria-pressed={filterCompany?.id === homeCompany.id}
              onClick={() => onFilterCompany(homeCompany)}
              className={cn(
                "max-w-32 truncate rounded px-2 py-0.5",
                MICRO,
                filterCompany?.id === homeCompany.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
              title={`Only ${homeCompany.name}`}
            >
              {homeCompany.name}
            </button>
          </div>
        )}
        <div role="group" aria-label="Queue grouping" className={cn("flex items-center rounded-md border p-0.5", !(homeCompany && onFilterCompany) && "ml-auto")}>
          {PLICA_QUEUE_GROUPINGS.map(({ grouping: mode, label }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={grouping === mode}
              onClick={() => onGrouping(mode)}
              className={cn(
                "rounded px-2 py-0.5",
                MICRO,
                grouping === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filterCompany && filterCompany.id !== homeCompany?.id && (
        <div className={cn("flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5", MICRO)}>
          <CompanyPatternIcon
            companyName={filterCompany.name}
            logoUrl={filterCompany.logoUrl}
            brandColor={filterCompany.brandColor}
            className="size-4 shrink-0 rounded text-[7px]"
          />
          <span className="min-w-0 truncate">
            Only <span className="font-medium text-foreground">{filterCompany.name}</span>
          </span>
          <button
            type="button"
            onClick={onClearFilter}
            aria-label="Show all companies"
            className="ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> all companies
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {summary.total === 0 ? (
          <p className={cn("px-3 py-6 text-center text-muted-foreground", BODY)}>
            {filterCompany ? `Nothing from ${filterCompany.name} needs you.` : "Nothing needs you right now."}
          </p>
        ) : (
          groups.map((group) => {
            const folded = group.bucket === "later" && !laterOpen;
            return (
              <section key={group.key} data-queue-group={group.key}>
                {group.bucket === "later" ? (
                  <button
                    type="button"
                    aria-expanded={laterOpen}
                    onClick={() => setLaterOpen((open) => !open)}
                    className={cn(
                      "flex w-full items-center gap-2 border-t px-3 pb-1 pt-3 text-left hover:bg-muted/30",
                      MICRO,
                    )}
                  >
                    {laterOpen ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {group.items.length} low-priority notice{group.items.length === 1 ? "" : "s"}
                    </span>
                  </button>
                ) : (
                  <div className={cn("flex items-center gap-2 px-3 pb-1 pt-3", MICRO)}>
                    {group.company && (
                      <CompanyPatternIcon
                        companyName={group.company.name}
                        logoUrl={group.company.logoUrl}
                        brandColor={group.company.brandColor}
                        className="size-4 shrink-0 rounded text-[7px]"
                      />
                    )}
                    <span className="font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</span>
                    <span className="tabular-nums text-muted-foreground">{group.items.length}</span>
                  </div>
                )}
                {!folded && (
                  <ul className="flex flex-col">
                    {group.items.map((item) => {
                      const company = companiesById[item.companyId];
                      if (!company) return null;
                      return (
                        <PlicaQueueItemRow
                          key={item.id}
                          item={item}
                          company={company}
                          nowMs={nowMs}
                          onActed={() => onActed(company.id)}
                        />
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>

      {footer && <div className="border-t px-3 py-2">{footer}</div>}
    </aside>
  );
}
