import { ExternalLink, Pin } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { CompanyPatternIcon, companyAccentColor } from "../host/ui-kit";
import { cn } from "../host/util";
import {
  deriveNeedsBreakdown,
  deriveThroughput,
  formatAgeMinutes,
  formatTokensMillions,
  selectCeo,
  tokenState,
  type PlicaActionable,
  type PlicaCompanyStats,
  type PlicaTokenThresholds,
} from "../lib/plica";
import { PlicaCeoStrip } from "./PlicaCeoStrip";
import { PlicaCapacityStrip } from "./PlicaCapacityStrip";
import { PlicaLink } from "./PlicaLink";
import { PlicaSparkline } from "./PlicaSparkline";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

/**
 * Column headers, kept beside the row so the table head can't drift from it.
 *
 * Order is the argument: what is waiting on you sits immediately right of the
 * company, because those are the only two figures you can act on. Everything
 * after them is context. Running has no column at all — it lives inside the
 * company cell, so a company and who is working for it read as one unit.
 */
export const PLICA_BOARD_COLUMNS: ReadonlyArray<{ key: string; label: string; align: "left" | "right" }> = [
  { key: "company", label: "Company", align: "left" },
  { key: "needs", label: "Need you", align: "right" },
  { key: "questions", label: "Questions", align: "right" },
  { key: "blocked", label: "Blocked", align: "right" },
  { key: "review", label: "Review", align: "right" },
  { key: "open", label: "Open", align: "right" },
  { key: "throughput", label: "Runs/d", align: "left" },
  { key: "tokens", label: "Tokens", align: "left" },
  { key: "actions", label: "", align: "right" },
];

const NUM = "text-[length:var(--plica-fs-title,20px)] leading-[1.15] font-semibold tabular-nums tracking-tight";
const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";
/** A zero is quieter than muted text: a clear company should read as empty field. */
const ZERO = "text-muted-foreground/40";

/**
 * One company as a row of the board.
 *
 * Every cell is a single figure — the detail that used to sit under the
 * numbers (the oldest wait, the expired count, the in-progress/blocked split)
 * lives in each cell's title instead, so all rows are one height and nothing
 * has to be read twice. Colour marks only the exception: ochre for waiting,
 * brick for broken, and nothing at all for a company that is fine.
 */
export function PlicaBoardRow({
  company,
  data,
  stats,
  actionable,
  thresholds,
  pulse = false,
  pinned = false,
  onTogglePin,
  onFocusNeeds,
  needsFocused = false,
  nowMs,
}: {
  company: Company;
  data: PlicaCompanyData;
  stats: PlicaCompanyStats;
  actionable: PlicaActionable;
  thresholds: PlicaTokenThresholds;
  /** Alert ring (usePlicaAlerts) — throbs the row without dimming its text. */
  pulse?: boolean;
  /** Watched companies sort to the top of the board. */
  pinned?: boolean;
  onTogglePin?: () => void;
  /** Filters the queue rail to this company (toggle). */
  onFocusNeeds?: () => void;
  needsFocused?: boolean;
  nowMs: number;
}) {
  const loading = data.isLoading && !data.unavailable && data.summary === undefined;
  const blind = loading || data.unavailable;
  const throughput = deriveThroughput(data.summary?.runActivity ?? []);
  const tokenTone = stats.tokens === undefined ? "ok" : tokenState(stats.tokens, thresholds);
  const needs = deriveNeedsBreakdown(data.attention);
  const ceo = selectCeo(data.agents);
  const dash = <span className="text-muted-foreground/50">—</span>;

  const needsTone = actionable.count === 0 ? ZERO : actionable.criticalOrHigh ? "text-plica-alarm" : "text-plica-wait";
  const needsTitle =
    actionable.count === 0
      ? "Nothing waiting on you"
      : `${actionable.count} waiting on you${stats.oldestMins !== null ? ` · oldest ${formatAgeMinutes(stats.oldestMins)}` : ""}`;

  return (
    <tr
      data-board-row={company.id}
      data-pulse={pulse}
      aria-pressed={onFocusNeeds ? needsFocused : undefined}
      onClick={
        onFocusNeeds
          ? (event) => {
              // The whole row filters the queue — except where a control
              // (pin, open link, the buttons) already owns the click.
              if ((event.target as HTMLElement).closest("button, a, input, [role=button], [data-no-row-click]")) return;
              onFocusNeeds();
            }
          : undefined
      }
      title={onFocusNeeds ? (needsFocused ? "Showing only this company in the queue — click to show all" : "Click to filter the queue to this company") : undefined}
      className={cn(
        "border-t align-middle hover:bg-muted/30",
        onFocusNeeds && "cursor-pointer",
        needsFocused && "bg-muted/40",
        pulse && "animate-[pulse_3s_ease-in-out_infinite] bg-red-500/10 motion-reduce:animate-none",
      )}
    >
      <td className="w-full min-w-0 border-l-4 py-2.5 pl-3 pr-2" style={{ borderLeftColor: companyAccentColor(company.name) }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onFocusNeeds}
            disabled={!onFocusNeeds}
            aria-pressed={needsFocused}
            aria-label={needsFocused ? `Show all companies in the queue` : `Show only ${company.name} in the queue`}
            title={needsFocused ? "Showing only this company in the queue — click to show all" : "Filter the queue to this company"}
            className={cn(
              "-m-1 rounded-md p-1 transition-colors",
              onFocusNeeds && "hover:bg-muted",
              needsFocused && "bg-muted ring-1 ring-border",
            )}
          >
            <CompanyPatternIcon
              companyName={company.name}
              logoUrl={company.logoUrl}
              className="size-7 shrink-0 rounded-md text-[10px]"
            />
          </button>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onFocusNeeds}
                disabled={!onFocusNeeds}
                aria-pressed={needsFocused}
                data-company-filter
                className={cn(
                  "truncate text-left text-[length:var(--plica-fs-stat,16px)] leading-[1.25] font-semibold tracking-tight",
                  onFocusNeeds && "hover:underline decoration-dotted underline-offset-4",
                  needsFocused && "underline decoration-dotted underline-offset-4",
                )}
                title={needsFocused ? "Showing only this company in the queue — click to show all" : "Filter the queue to this company"}
              >
                {company.name}
              </button>
              {data.unavailable && (
                <span className={cn(MICRO, "rounded-sm border border-plica-alarm/40 bg-plica-alarm/10 px-1.5 text-plica-alarm")}>
                  unreachable
                </span>
              )}
              {!data.unavailable && data.staleSince !== null && (
                <span
                  className={cn(MICRO, "rounded-sm border border-plica-wait/40 bg-plica-wait/10 px-1.5 text-plica-wait")}
                  title={`Stale since ${new Date(data.staleSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                >
                  stale
                </span>
              )}
            </div>
            {/* Who is working for this company, hard left with its name: the
                chief's own square, then who they are, then the team. */}
            <div className="flex min-w-0 items-center">
              <PlicaCapacityStrip
                agents={data.agents}
                liveRuns={data.liveRuns}
                issues={data.issues}
                company={company}
                nowMs={nowMs}
                unavailable={data.unavailable}
                leadAgentId={ceo?.id ?? null}
                lead={
                  !data.unavailable && !loading ? <PlicaCeoStrip agents={data.agents} company={company} /> : undefined
                }
              />
            </div>
          </div>
        </div>
      </td>

      <td className="w-px whitespace-nowrap px-2 py-2 text-right">
        {blind ? (
          dash
        ) : (
          <button
            type="button"
            onClick={onFocusNeeds}
            disabled={!onFocusNeeds || actionable.count === 0}
            aria-pressed={needsFocused}
            title={needsTitle}
            className={cn(NUM, needsTone, "rounded-md px-1.5 -mr-1.5 disabled:pointer-events-none", onFocusNeeds && "hover:bg-muted", needsFocused && "bg-muted ring-1 ring-border")}
          >
            {actionable.count}
          </button>
        )}
      </td>

      <td className="w-px whitespace-nowrap px-2 py-2 text-right">
        {blind ? (
          dash
        ) : (
          <span
            className={cn(NUM, needs.questions === 0 ? ZERO : "text-plica-wait")}
            title={
              needs.questions === 0
                ? "No agent is waiting on an answer"
                : `${needs.questions} question${needs.questions === 1 ? "" : "s"} from agents waiting on an answer — part of Need you`
            }
          >
            {needs.questions}
          </span>
        )}
      </td>

      <td className="w-px whitespace-nowrap px-2 py-2 text-right">
        {blind ? (
          dash
        ) : (
          <span
            className={cn(NUM, needs.blocked === 0 ? ZERO : "text-plica-wait")}
            title={
              needs.blocked === 0
                ? "Nothing blocked is waiting on you"
                : `${needs.blocked} blocker${needs.blocked === 1 ? "" : "s"} waiting on you · ${stats.tasksBlocked} issue${stats.tasksBlocked === 1 ? "" : "s"} blocked in total`
            }
          >
            {needs.blocked}
          </span>
        )}
      </td>

      <td className="w-px whitespace-nowrap px-2 py-2 text-right">
        {blind ? (
          dash
        ) : (
          <span
            className={cn(NUM, needs.review === 0 ? ZERO : "text-plica-wait")}
            title={
              needs.review === 0
                ? "Nothing is waiting on your review"
                : `${needs.review} item${needs.review === 1 ? "" : "s"} waiting on your review — part of Need you`
            }
          >
            {needs.review}
          </span>
        )}
      </td>

      <td className="w-px whitespace-nowrap px-2 py-2 text-right">
        {blind ? (
          dash
        ) : (
          <span
            className={cn(NUM, stats.tasksOpen === 0 ? ZERO : stats.tasksBlocked > 0 ? "text-plica-wait" : undefined)}
            title={
              `${stats.tasksOpen} open — every issue that is not done or cancelled, ` +
              `including the blocked and in-review ones counted to the left · ` +
              `${stats.tasksInProgress} in progress · ${stats.tasksBlocked} blocked`
            }
          >
            {stats.tasksOpen}
          </span>
        )}
      </td>

      <td className="w-px whitespace-nowrap px-2 py-2">
        {blind ? (
          dash
        ) : (
          <span
            className="flex items-center gap-2"
            title={
              `${throughput.total} run${throughput.total === 1 ? "" : "s"} over 7 days · ` +
              `${throughput.succeeded} succeeded, ${throughput.failed} failed` +
              (throughput.failRatePct !== null ? ` (${throughput.failRatePct}%)` : "")
            }
          >
            <span
              className={cn(
                "text-[length:var(--plica-fs-stat,16px)] leading-none font-semibold tabular-nums tracking-tight",
                throughput.total === 0 && ZERO,
                // A high failure rate is the only thing that colours this cell.
                throughput.failRatePct !== null && throughput.failRatePct >= 20 && "text-plica-alarm",
              )}
            >
              {throughput.perDay}
            </span>
            {/* The rate is the measure; the bars are texture, so they are the
                first thing to go when the row is tight rather than a scrollbar. */}
            <span className="hidden xl:inline-flex">
              <PlicaSparkline runActivity={data.summary?.runActivity ?? []} />
            </span>
          </span>
        )}
      </td>

      <td className="w-px whitespace-nowrap px-2 py-2">
        {blind || stats.tokens === undefined ? (
          dash
        ) : (
          <span
            className={cn(
              "text-[length:var(--plica-fs-stat,16px)] leading-none font-semibold tabular-nums tracking-tight",
              stats.tokens === 0 && ZERO,
              tokenTone === "crit" && "text-plica-alarm",
              tokenTone === "warn" && "text-plica-wait",
            )}
            title={
              `${stats.tokens.toLocaleString()} tokens this month · ` +
              (tokenTone === "crit"
                ? `over your ${formatTokensMillions(thresholds.crit)}M critical line`
                : tokenTone === "warn"
                  ? `over your ${formatTokensMillions(thresholds.warn)}M warning line`
                  : `under your ${formatTokensMillions(thresholds.warn)}M warning line`)
            }
          >
            {formatTokensMillions(stats.tokens)}
            <span className={cn(MICRO, "ml-0.5 font-normal text-muted-foreground")}>M</span>
          </span>
        )}
      </td>

      <td className="w-px whitespace-nowrap py-2 pl-1 pr-2 text-right">
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? `Stop watching ${company.name}` : `Watch ${company.name}`}
            title={pinned ? "Watched — sorts to the top" : "Watch — sort to the top"}
            className={cn(
              "mr-0.5 inline-flex rounded-md p-1",
              pinned ? "text-plica-wait" : "text-muted-foreground/40 hover:text-foreground",
            )}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
        )}
        <PlicaLink
          to={`/${company.issuePrefix}/dashboard`}
          companyId={company.id}
          title={`Open ${company.name}`}
          aria-label={`Open ${company.name}`}
          className="inline-flex rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </PlicaLink>
      </td>
    </tr>
  );
}
