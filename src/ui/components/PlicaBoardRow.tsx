import { ExternalLink, Pin } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { CompanyPatternIcon, companyAccentColor } from "../host/ui-kit";
import { cn } from "../host/util";
import {
  derivePaneHealth,
  deriveRoutineHealth,
  formatCents,
  formatCountdown,
  formatTokens,
  healthLabel,
  tokenState,
  type PlicaActionable,
  type PlicaCompanyStats,
  type PlicaHealth,
  type PlicaTokenThresholds,
} from "../lib/plica";
import { PlicaCeoStrip } from "./PlicaCeoStrip";
import { PlicaLink } from "./PlicaLink";
import { LiveDot } from "./PlicaRunsStrip";
import { PlicaSparkline } from "./PlicaSparkline";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

/** Column headers, kept beside the row so the table head can't drift from it. */
export const PLICA_BOARD_COLUMNS: ReadonlyArray<{ key: string; label: string; align: "left" | "right" }> = [
  { key: "company", label: "Company", align: "left" },
  { key: "running", label: "Running", align: "right" },
  { key: "tasks", label: "Tasks", align: "right" },
  { key: "needs", label: "Need you", align: "right" },
  { key: "routines", label: "Routines", align: "left" },
  { key: "spend", label: "Spend", align: "left" },
  { key: "week", label: "7d", align: "left" },
  { key: "open", label: "", align: "right" },
];

const HEALTH_DOT: Record<PlicaHealth, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const NUM = "text-[length:var(--plica-fs-title,20px)] leading-[1.2] font-semibold tabular-nums tracking-tight";
const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

/**
 * One company as a row of the board: who runs it and how it is doing, in
 * numbers you can scan down a column. Everything that *needs* you lives in
 * the queue beside the board, so this row carries counts, not items.
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
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary, data.attention);
  const loading = data.isLoading && !data.unavailable && data.summary === undefined;
  const routines = deriveRoutineHealth(data.routines, nowMs);
  const spend = data.summary?.costs.monthSpendCents ?? 0;
  const budget = data.summary?.costs.monthBudgetCents ?? 0;
  const utilization = data.summary?.costs.monthUtilizationPercent ?? 0;
  const spendHot = utilization >= 80;
  const tokenTone = stats.tokens === undefined ? "ok" : tokenState(stats.tokens, thresholds);
  const dash = <span className="text-muted-foreground/50">—</span>;

  return (
    <tr
      data-board-row={company.id}
      data-health={health}
      data-pulse={pulse}
      className={cn(
        "border-t align-middle hover:bg-muted/30",
        pulse && "animate-[pulse_3s_ease-in-out_infinite] bg-red-500/10 motion-reduce:animate-none",
      )}
    >
      <td className="border-l-4 py-2.5 pl-3 pr-2" style={{ borderLeftColor: companyAccentColor(company.name, company.brandColor) }}>
        <div className="flex items-center gap-2.5">
          <CompanyPatternIcon
            companyName={company.name}
            logoUrl={company.logoUrl}
            brandColor={company.brandColor}
            className="size-7 shrink-0 rounded-md text-[10px]"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[length:var(--plica-fs-stat,16px)] leading-[1.25] font-semibold tracking-tight">
                {company.name}
              </span>
              <span
                role="img"
                title={healthLabel(health, data.summary)}
                aria-label={healthLabel(health, data.summary)}
                className={cn("size-2 shrink-0 rounded-full", HEALTH_DOT[health])}
              />
              {data.unavailable && (
                <span className={cn(MICRO, "rounded-full border border-red-500/40 bg-red-500/10 px-1.5 text-red-700 dark:text-red-300")}>
                  unreachable
                </span>
              )}
              {!data.unavailable && data.staleSince !== null && (
                <span
                  className={cn(MICRO, "rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-amber-700 dark:text-amber-300")}
                  title={`Stale since ${new Date(data.staleSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                >
                  stale
                </span>
              )}
            </div>
            {!data.unavailable && !loading && (
              <div className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45]">
                <PlicaCeoStrip agents={data.agents} company={company} onActed={data.invalidate} />
              </div>
            )}
          </div>
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              aria-pressed={pinned}
              aria-label={pinned ? `Stop watching ${company.name}` : `Watch ${company.name}`}
              title={pinned ? "Watched — sorts to the top" : "Watch — sort to the top"}
              className={cn(
                "ml-1 shrink-0 rounded-md p-1",
                pinned ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/40 hover:text-foreground",
              )}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>

      <td className="px-3 py-2 text-right">
        {loading || data.unavailable ? (
          dash
        ) : (
          <span className="inline-flex items-center gap-2">
            {stats.running > 0 && <LiveDot />}
            <span className={NUM}>
              {stats.running}
              <span className={cn(MICRO, "font-normal text-muted-foreground")}>/{stats.active}</span>
            </span>
          </span>
        )}
      </td>

      <td className={cn("px-3 py-2 text-right", NUM)}>
        {loading || data.unavailable ? dash : stats.tasks === 0 ? <span className="text-muted-foreground/50">0</span> : stats.tasks}
      </td>

      <td className="px-3 py-2 text-right">
        {loading || data.unavailable || actionable.count === 0 ? (
          <span className={NUM}>{dash}</span>
        ) : (
          <button
            type="button"
            onClick={onFocusNeeds}
            disabled={!onFocusNeeds}
            aria-pressed={needsFocused}
            title={`${actionable.count} item${actionable.count === 1 ? "" : "s"} need${actionable.count === 1 ? "s" : ""} you — ${needsFocused ? "showing all companies" : "show only these in the queue"}`}
            className={cn(
              NUM,
              "rounded-md px-1.5 -mr-1.5 disabled:pointer-events-none",
              actionable.criticalOrHigh ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300",
              onFocusNeeds && "hover:bg-muted",
              needsFocused && "bg-muted ring-1 ring-border",
            )}
          >
            {actionable.count}
          </button>
        )}
      </td>

      <td className="px-3 py-2">
        {routines.total === 0 ? (
          dash
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className={cn("tabular-nums", (routines.overdue > 0 || routines.failing > 0) && "text-amber-700 dark:text-amber-300")}>
              {routines.active}
              {routines.overdue > 0 && ` · ${routines.overdue} overdue`}
              {routines.failing > 0 && <span className="text-red-600 dark:text-red-400"> · {routines.failing} failed</span>}
            </span>
            <span className={cn(MICRO, "text-muted-foreground")} title={routines.nextTitle ?? undefined}>
              {routines.nextRunAt ? `next ${formatCountdown(routines.nextRunAt, nowMs)}` : "none scheduled"}
            </span>
          </div>
        )}
      </td>

      <td className="px-3 py-2">
        {loading || data.unavailable ? (
          dash
        ) : (
          <div
            className="flex flex-col gap-1"
            title={stats.tokens === undefined ? undefined : `${formatTokens(stats.tokens)} tokens this month`}
          >
            <span className={cn("tabular-nums", spendHot && "font-semibold text-amber-700 dark:text-amber-300")}>
              {formatCents(spend)}
              {budget > 0 && <span className={cn(MICRO, "text-muted-foreground")}> / {formatCents(budget)}</span>}
              {tokenTone !== "ok" && (
                <span
                  className={cn(
                    MICRO,
                    "ml-1.5 rounded-sm px-1",
                    tokenTone === "crit"
                      ? "bg-red-500/15 text-red-700 dark:text-red-300"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                  )}
                >
                  {formatTokens(stats.tokens ?? 0)} tok
                </span>
              )}
            </span>
            {budget > 0 && (
              <span className="relative block h-1 w-20 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", spendHot ? "bg-amber-500" : "bg-muted-foreground/60")}
                  style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }}
                />
              </span>
            )}
          </div>
        )}
      </td>

      <td className="px-3 py-2">
        <PlicaSparkline runActivity={data.summary?.runActivity ?? []} />
      </td>

      <td className="py-2 pl-1 pr-3 text-right">
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
