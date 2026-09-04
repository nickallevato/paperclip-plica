import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  HeartPulse,
  CalendarClock,
  X,
} from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { Button, CompanyPatternIcon } from "../host/ui-kit";
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
  PLICA_QUEUE_AGE_FILTERS,
  PLICA_QUEUE_GROUPINGS,
  ageTone,
  queueItemAgeMinutes,
  type PlicaQueueAgeFilter,
  type PlicaQueueGroup,
  type PlicaQueueGrouping,
  type PlicaQueueItem,
  type PlicaQueueSort,
  type PlicaQueueSummary,
} from "../lib/queue";
import {
  PlicaAskBlock,
  PlicaInteractionActions,
  hasInlineInteraction,
} from "./PlicaInteractionActions";
import { PlicaKindGlyph } from "./PlicaKindGlyph";
import { PlicaListControls } from "./PlicaListControls";
import { PlicaLink } from "./PlicaLink";
import { useApprovalDecision } from "./useApprovalDecision";

/** How the empty state names the bucket you are standing in. */
const AGE_EMPTY: Record<string, string> = {
  today: "today",
  yesterday: "yesterday",
  week: "the last week",
  old: "more than a week ago",
};

const QUEUE_SORTS = [
  { sort: "oldest" as const, label: "oldest" },
  { sort: "newest" as const, label: "newest" },
] as const;

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
  if (
    kind === "issue_thread_interaction" &&
    typeof interactionKind === "string"
  ) {
    return INTERACTION_LABELS[interactionKind] ?? KIND_LABELS[kind] ?? kind;
  }
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function Avatar({ company }: { company: Company }) {
  return (
    <CompanyPatternIcon
      companyName={company.name}
      logoUrl={company.logoUrl}
      className="mt-0.5 size-5 shrink-0 rounded-md text-[8px]"
    />
  );
}

function ApprovalActions({
  item,
  onActed,
}: {
  item: Extract<PlicaQueueItem, { kind: "approval" }>;
  onActed: () => void;
}) {
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

function OpenLink({
  to,
  companyId,
  label = "Open",
}: {
  to: string;
  companyId: string;
  label?: string;
}) {
  return (
    <PlicaLink
      to={to}
      companyId={companyId}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md border px-2 text-muted-foreground hover:text-foreground",
        MICRO,
      )}
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
  const critical =
    item.kind === "attention" && item.item.severity === "critical";
  // The edge says *whose* item this is (it matches the company avatar); how
  // urgent it is moves to a mark before the title so the two never compete.

  let identifier: string | null = null;
  let title: string;
  let meta: ReactNode;
  let actions: ReactNode;
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
          approval{item.requestedBy ? ` · ${item.requestedBy} asks` : ""} ·{" "}
          {relativeTimeLabel(
            new Date(item.approval.createdAt).toISOString(),
            nowMs,
          )}
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
      meta = (
        <>
          <PlicaKindGlyph kind={item.item.sourceKind} />
          <span className="truncate" title={item.item.whyNow}>
            {kindLabel(item.item.sourceKind, item.item.subject.metadata?.kind)}
            {item.item.originAgentName && !ask
              ? ` · ${item.item.originAgentName}`
              : ""}
          </span>
        </>
      );
      const href = subject.href
        ? `/${company.issuePrefix}${toCompanyRelativePath(subject.href)}`
        : `/${company.issuePrefix}/decisions`;
      if (hasInlineInteraction(item.item))
        inline = (
          <PlicaInteractionActions
            item={item.item}
            headline={title}
            onActed={onActed}
          />
        );
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
        <OpenLink
          to={href}
          companyId={company.id}
          label={attentionActionLabel(item.item)}
        />
      );
      break;
    }
    case "heartbeat": {
      title = `${item.ceo.name} heartbeat overdue`;
      const interval = intervalLabel(item.beat.intervalSec);
      meta = (
        <>
          <HeartPulse className="h-3 w-3 shrink-0" />
          last beat{" "}
          {item.beat.lastBeatAt
            ? relativeTimeLabel(item.beat.lastBeatAt, nowMs)
            : "never"}
          {interval ? ` · expected every ${interval}` : ""}
        </>
      );
      actions = (
        <OpenLink
          to={`/${company.issuePrefix}/agents/${item.ceo.urlKey ?? item.ceo.id}`}
          companyId={company.id}
          label="Open CEO"
        />
      );
      break;
    }
    case "routine":
    default: {
      title = item.routine.title;
      meta = (
        <>
          <CalendarClock className="h-3 w-3 shrink-0" />
          routine ·{" "}
          {item.reason === "overdue"
            ? "scheduled run is overdue"
            : "last run failed"}
        </>
      );
      actions = (
        <OpenLink
          to={`/${company.issuePrefix}/routines/${item.routine.id}`}
          companyId={company.id}
        />
      );
      break;
    }
  }

  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className={cn("flex items-baseline gap-1.5", BODY)}>
        {critical ? (
          <AlertTriangle
            className="h-3 w-3 shrink-0 self-center text-red-600 dark:text-red-400"
            aria-label="critical"
          />
        ) : item.bucket === "now" ? (
          <span
            className="size-1.5 shrink-0 self-center rounded-full bg-amber-500"
            aria-label="now"
          />
        ) : null}
        {identifier && (
          <span
            className={cn(
              "shrink-0 font-mono tabular-nums text-muted-foreground",
              MICRO,
            )}
          >
            {identifier}
          </span>
        )}
        <span className="min-w-0 truncate" title={title}>
          {title}
        </span>
      </div>
      {ask &&
        (item.kind === "attention" ? (
          <PlicaAskBlock item={item.item} text={ask} />
        ) : (
          <p
            data-queue-ask
            className={cn("line-clamp-2 text-muted-foreground", BODY)}
          >
            {ask}
          </p>
        ))}
      <div
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-muted-foreground",
          MICRO,
          critical && "text-red-700 dark:text-red-300",
        )}
      >
        {meta}
        {inline && (
          <span
            data-queue-inline
            className="ml-auto flex shrink-0 items-center gap-1"
          >
            {inline}
          </span>
        )}
        <span
          data-age-tone={tone}
          className={cn(
            "shrink-0 tabular-nums",
            !inline && "ml-auto",
            tone === "stale" && "font-semibold text-red-600 dark:text-red-400",
            tone === "aging" &&
              "font-medium text-amber-700 dark:text-amber-300",
          )}
          title={
            tone === "stale"
              ? "waiting a month or more"
              : tone === "aging"
                ? "waiting over a week"
                : undefined
          }
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
      className={cn(
        "flex items-start gap-2.5 py-2 pl-3 pr-3 hover:bg-muted/30",
        critical && "bg-red-500/[0.08]",
      )}
    >
      <Avatar company={company} />
      {body}
      <span className="flex shrink-0 items-center gap-1 self-center">
        {actions}
      </span>
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
  sort,
  onSort,
  ageFilter,
  onAgeFilter,
  ageCounts,
  companiesById,
  nowMs,
  onActed,
  footer,
  filterCompany,
  onClearFilter,
}: {
  groups: PlicaQueueGroup[];
  summary: PlicaQueueSummary;
  grouping: PlicaQueueGrouping;
  onGrouping: (grouping: PlicaQueueGrouping) => void;
  /** Which way the age tiebreaker runs inside each group. */
  sort: PlicaQueueSort;
  onSort: (sort: PlicaQueueSort) => void;
  /** Which age bucket the rail is narrowed to; "all" shows everything. */
  ageFilter: PlicaQueueAgeFilter;
  onAgeFilter: (filter: PlicaQueueAgeFilter) => void;
  /** Per-bucket counts of the *unfiltered* queue, so each chip carries its own. */
  ageCounts: Record<PlicaQueueAgeFilter, number>;
  companiesById: Record<string, Company | undefined>;
  nowMs: number;
  onActed: (companyId: string) => void;
  /** Rendered at the bottom of the rail — the "since you last looked" line. */
  footer?: ReactNode;
  /** When set, the rail shows only this company's items and says so. */
  filterCompany?: Company | null;
  onClearFilter?: () => void;
}) {
  // Fold state per group key, holding only the groups you have clicked. Later
  // starts shut — it is a count you can open, not a list you must read — and
  // every other group starts open, so a fresh grouping needs no seeding.
  //
  // Except under an age filter, where Later starts open: narrowing to "Old" is
  // an explicit request for that slice, and a rail whose only match is folded
  // away reads as empty. The filter is the reader asking to see something, so
  // hiding it behind a second click would be answering the wrong question.
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const defaultOpen = (group: PlicaQueueGroup) => group.bucket !== "later" || ageFilter !== "all";
  const isOpen = (group: PlicaQueueGroup) => folds[group.key] ?? defaultOpen(group);
  const toggle = (group: PlicaQueueGroup) =>
    setFolds((current) => ({
      ...current,
      [group.key]: !(current[group.key] ?? defaultOpen(group)),
    }));
  const urgent = summary.now + summary.soon;

  return (
    <aside
      data-plica-queue
      aria-label="Needs you"
      className="flex min-h-0 flex-col rounded-lg border bg-muted/20"
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
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
          <span className={cn(MICRO, "text-emerald-600 dark:text-emerald-400")}>
            clear
          </span>
        )}
        {summary.oldestMins !== null && (
          <span className={cn(MICRO, "tabular-nums text-muted-foreground")}>
            oldest {formatAgeMinutes(summary.oldestMins)}
          </span>
        )}
        <PlicaListControls
          groupings={PLICA_QUEUE_GROUPINGS}
          grouping={grouping}
          onGrouping={onGrouping}
          groupingLabel="Queue grouping"
          sorts={QUEUE_SORTS}
          sort={sort}
          onSort={onSort}
        />
      </div>

      {/* Age chips. A rail carrying a hundred-odd items is not a queue you
          work, it is a wall you stop reading — and the oldest things on it are
          the least likely to still matter. These narrow it to one day's worth
          without losing the others: every chip keeps the count it would show,
          so nothing is hidden silently. Empty buckets stay visible and
          disabled rather than disappearing, so the chips never move under the
          cursor as items age past midnight. */}
      <div role="group" aria-label="Filter by age" className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5">
        {PLICA_QUEUE_AGE_FILTERS.map(({ filter, label }) => {
          const count = ageCounts[filter] ?? 0;
          const active = ageFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              data-age-chip={filter}
              aria-pressed={active}
              disabled={count === 0 && !active}
              onClick={() => onAgeFilter(filter)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 tabular-nums transition-colors",
                MICRO,
                active
                  ? "border-transparent bg-foreground text-background"
                  : count === 0
                    ? "text-muted-foreground/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
              <span className={cn(active ? "opacity-70" : "opacity-60")}>{count}</span>
            </button>
          );
        })}
      </div>

      {filterCompany && (
        <div
          className={cn(
            "flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5",
            MICRO,
          )}
        >
          <CompanyPatternIcon
            companyName={filterCompany.name}
            logoUrl={filterCompany.logoUrl}
            className="size-4 shrink-0 rounded text-[7px]"
          />
          <span className="min-w-0 truncate">
            Only{" "}
            <span className="font-medium text-foreground">
              {filterCompany.name}
            </span>
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
          <p
            className={cn("px-3 py-6 text-center text-muted-foreground", BODY)}
          >
            {ageFilter !== "all"
              ? `Nothing here from ${AGE_EMPTY[ageFilter]}.`
              : filterCompany
                ? `Nothing from ${filterCompany.name} needs you.`
                : "Nothing needs you right now."}
          </p>
        ) : (
          groups.map((group) => {
            const open = isOpen(group);
            return (
              <section
                key={group.key}
                data-queue-group={group.key}
                data-open={open}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  title={
                    open ? `Collapse ${group.label}` : `Expand ${group.label}`
                  }
                  onClick={() => toggle(group)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 pb-1 pt-3 text-left hover:bg-muted/30",
                    MICRO,
                    group.bucket === "later" && "border-t",
                  )}
                >
                  {open ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  {group.company && (
                    <CompanyPatternIcon
                      companyName={group.company.name}
                      logoUrl={group.company.logoUrl}
                      className="size-4 shrink-0 rounded text-[7px]"
                    />
                  )}
                  <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {group.bucket === "later"
                      ? `${group.items.length} low-priority notice${group.items.length === 1 ? "" : "s"}`
                      : group.items.length}
                  </span>
                </button>
                {open && (
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
