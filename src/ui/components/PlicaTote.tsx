import type { ReactNode } from "react";
import type { Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import {
  aggregateTokenState,
  formatAgeMinutes,
  formatTokens,
  type PlicaCompanyStats,
  type PlicaTokenSettings,
} from "../lib/plica";

/**
 * A portfolio figure with its per-company split spelled out underneath. The
 * split is initials and numbers rather than a chart because the whole point of
 * the bar is to be read, not decoded.
 */
function Tile({
  value,
  label,
  detail,
  tone,
}: {
  value: string;
  label: string;
  detail: ReactNode;
  tone?: "warn" | "crit";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-lg border bg-card px-2.5 py-2",
        tone === "warn" && "border-amber-500/40 bg-amber-500/10",
        tone === "crit" && "border-red-500/40 bg-red-500/10",
      )}
    >
      <span
        className={cn(
          "text-[length:calc(var(--plica-fs-title,20px)*1.35)] font-semibold leading-none tabular-nums tracking-tight",
          tone === "warn" && "text-amber-700 dark:text-amber-300",
          tone === "crit" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
        {detail}
      </span>
    </div>
  );
}

/** "LI 6 · ME 4 · NG 2" — the top contributors, biggest first. */
function split(
  entries: ReadonlyArray<{ company: Company; value: number }>,
  format: (n: number) => string = String,
): ReactNode {
  const live = entries.filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value).slice(0, 4);
  if (!live.length) return "none";
  return live.map((entry, index) => (
    <span key={entry.company.id}>
      {index > 0 && " · "}
      {entry.company.issuePrefix} <b className="font-semibold text-foreground">{format(entry.value)}</b>
    </span>
  ));
}

/**
 * The one bar mode that adds companies together. Every other mode is a card or
 * a row per company; this asks portfolio questions — how much needs me across
 * everything, how many companies are red, what is the single oldest thing
 * waiting anywhere — which none of them can answer.
 */
export function PlicaTote({
  companies,
  statsById,
  tokenSettings,
}: {
  companies: Company[];
  statsById: Record<string, PlicaCompanyStats | undefined>;
  tokenSettings: PlicaTokenSettings;
}) {
  const entries = companies
    .map((company) => ({ company, stats: statsById[company.id] }))
    .filter((entry): entry is { company: Company; stats: PlicaCompanyStats } => entry.stats !== undefined);

  const sum = (pick: (stats: PlicaCompanyStats) => number) =>
    entries.reduce((total, entry) => total + pick(entry.stats), 0);

  const needs = sum((stats) => stats.needs);
  const critical = sum((stats) => stats.critical);
  const failed = sum((stats) => stats.failed);
  const reds = entries.filter((entry) => entry.stats.critical > 0 || entry.stats.unavailable).length;
  const oldest = entries
    .filter((entry) => entry.stats.oldestMins !== null)
    .sort((a, b) => (b.stats.oldestMins ?? 0) - (a.stats.oldestMins ?? 0))[0];
  const tokens = aggregateTokenState(
    tokenSettings,
    entries.map((entry) => ({ id: entry.company.id, tokens: entry.stats.tokens })),
  );

  return (
    <div data-plica-tote className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <Tile
        value={String(needs)}
        label="Need you"
        detail={needs ? `${critical} critical · ${needs - critical} other` : "nothing waiting"}
        tone={critical ? "crit" : needs ? "warn" : undefined}
      />
      <Tile
        value={`${reds}/${entries.length}`}
        label="Companies red"
        detail={split(entries.map((e) => ({ company: e.company, value: e.stats.critical })))}
        tone={reds ? "crit" : undefined}
      />
      <Tile
        value={formatAgeMinutes(oldest?.stats.oldestMins ?? null)}
        label="Oldest waiting"
        detail={oldest ? oldest.company.name : "nothing waiting"}
        tone={(oldest?.stats.oldestMins ?? 0) > 720 ? "warn" : undefined}
      />
      <Tile
        value={String(sum((stats) => stats.tasks))}
        label="Tasks in flight"
        detail={split(entries.map((e) => ({ company: e.company, value: e.stats.tasks })))}
      />
      <Tile
        value={String(sum((stats) => stats.running))}
        label="Agents running"
        detail={
          <>
            of <b className="font-semibold text-foreground">{sum((stats) => stats.active)}</b> active ·{" "}
            {split(entries.map((e) => ({ company: e.company, value: e.stats.running })))}
          </>
        }
      />
      <Tile
        value={String(failed)}
        label="Failed runs"
        detail={split(entries.map((e) => ({ company: e.company, value: e.stats.failed })))}
        tone={failed ? "warn" : undefined}
      />
      <Tile
        value={tokens.known ? formatTokens(tokens.total) : "—"}
        label="Tokens this month"
        detail={
          tokens.known
            ? split(
                entries.map((e) => ({ company: e.company, value: e.stats.tokens ?? 0 })),
                formatTokens,
              )
            : "cost access required"
        }
        tone={!tokens.known || tokens.state === "ok" ? undefined : tokens.state}
      />
    </div>
  );
}
