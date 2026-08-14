import { ExternalLink, Pin } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { Card, CardContent, CardHeader, CardTitle } from "../host/ui-kit";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";
import {
  PLICA_HEALTH_DOT_CLASSES,
  attentionKindSummary,
  bucketAttentionByAge,
  derivePaneHealth,
  formatCents,
  formatTokens,
  healthLabel,
  tokenState,
  type PlicaCompanyStats,
  type PlicaTokenThresholds,
} from "../lib/plica";
import { PlicaLink } from "./PlicaLink";
import { PlicaKindGlyph } from "./PlicaKindGlyph";
import { PlicaSparkline } from "./PlicaSparkline";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

function Kpi({ value, label, tone }: { value: string; label: string; tone?: "warn" | "crit" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-md border bg-muted/30 px-1.5 py-1",
        tone === "warn" && "border-amber-500/40 bg-amber-500/10",
        tone === "crit" && "border-red-500/40 bg-red-500/10",
      )}
    >
      <span
        className={cn(
          "truncate text-[length:var(--plica-fs-stat,16px)] leading-[1.25] font-semibold tabular-nums",
          tone === "warn" && "text-amber-700 dark:text-amber-300",
          tone === "crit" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </span>
      <span className="truncate text-[length:var(--plica-fs-micro,11px)] leading-[1.45] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/** A labelled magnitude. Length carries the number; colour only marks alarm. */
function Bar({
  label,
  count,
  max,
  tone,
  icon,
}: {
  label: string;
  count: number;
  max: number;
  tone?: "warn" | "crit";
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]">
      <span className="flex w-16 shrink-0 items-center gap-1 truncate uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
        <span
          className={cn(
            "block h-full rounded-sm",
            tone === "crit" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : "bg-primary/60",
          )}
          style={{ width: `${max > 0 ? Math.round((count / max) * 100) : 0}%` }}
        />
      </span>
      <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

/**
 * A company read as measurements rather than a worklist: what is running, what
 * it is costing, and — the part nothing else surfaces — how long the waiting
 * work has been waiting.
 */
export function PlicaAnalyticPane({
  company,
  data,
  stats,
  thresholds,
  onTogglePin,
}: {
  company: Company;
  data: PlicaCompanyData;
  stats: PlicaCompanyStats;
  thresholds: PlicaTokenThresholds;
  onTogglePin?: () => void;
}) {
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary);
  const live = (data.attention?.items ?? []).filter((item) => !item.dismissal);
  const nowMs = Date.now();
  const ages = bucketAttentionByAge(live, nowMs);
  const ageMax = Math.max(1, ...ages.map((bucket) => bucket.count));
  const kinds = attentionKindSummary(data.attention).cells.filter((cell) => cell.count > 0);
  const kindMax = Math.max(1, ...kinds.map((cell) => cell.count));
  const utilization = data.summary?.costs.monthUtilizationPercent ?? 0;
  const tokens = stats.tokens;
  const tokenTone = tokens === undefined ? undefined : tokenState(tokens, thresholds);

  return (
    <Card className={cn("flex h-full flex-col gap-3 py-4", health === "amber" && "border-l-4 border-l-amber-500", health === "red" && "border-l-4 border-l-red-500")}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 px-4">
        <CompanyPatternIcon
          companyName={company.name}
          logoUrl={company.logoUrl}
          brandColor={company.brandColor}
          className="size-5 shrink-0 rounded-md text-[8px]"
        />
        <CardTitle className="truncate text-[length:var(--plica-fs-stat,16px)] leading-[1.25]">{company.name}</CardTitle>
        <span
          data-health={health}
          role="img"
          title={healthLabel(health, data.summary)}
          aria-label={healthLabel(health, data.summary)}
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PLICA_HEALTH_DOT_CLASSES[health])}
        />
        <div className="ml-auto flex items-center gap-2">
          <PlicaSparkline runActivity={data.summary?.runActivity ?? []} />
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title="Pin to the bar"
              aria-label={`Pin ${company.name} to the bar`}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
          )}
          <PlicaLink
            to={`/${company.issuePrefix}/dashboard`}
            companyId={company.id}
            className="inline-flex items-center gap-1 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground hover:text-foreground"
          >
            Open <ExternalLink className="h-3 w-3" />
          </PlicaLink>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 px-4">
        <div className="grid grid-cols-4 gap-1.5">
          <Kpi value={`${stats.running}/${stats.active}`} label="Agents" />
          <Kpi value={String(stats.tasks)} label="Tasks" />
          <Kpi
            value={String(stats.needs)}
            label="Attention"
            tone={stats.critical > 0 ? "crit" : stats.needs > 0 ? "warn" : undefined}
          />
          <Kpi
            value={tokens === undefined ? "—" : formatTokens(tokens)}
            label="Tokens"
            tone={tokenTone === "ok" ? undefined : tokenTone}
          />
        </div>

        <div>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold uppercase tracking-wide text-muted-foreground">
              Attention aging
            </span>
            {ages.some((bucket) => bucket.stale) && (
              <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-amber-700 dark:text-amber-300">
                something has waited over half a day
              </span>
            )}
          </div>
          {live.length === 0 ? (
            <p className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
              Nothing waiting.
            </p>
          ) : (
            <div className="space-y-0.5">
              {ages.map((bucket) => (
                <Bar
                  key={bucket.label}
                  label={bucket.label}
                  count={bucket.count}
                  max={ageMax}
                  tone={bucket.stale ? "warn" : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {kinds.length > 0 && (
          <div>
            <span className="mb-1 block text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold uppercase tracking-wide text-muted-foreground">
              By kind
            </span>
            <div className="space-y-0.5">
              {kinds.map((cell) => (
                <Bar
                  key={cell.kind}
                  label={cell.label}
                  count={cell.count}
                  max={kindMax}
                  tone={cell.worst === "critical" ? "crit" : cell.worst === "high" ? "warn" : undefined}
                  icon={<PlicaKindGlyph kind={cell.kind} className="h-2.5 w-2.5" />}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto space-y-1 border-t pt-3">
          <div className="flex items-center gap-2 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]">
            <span className="w-16 shrink-0 uppercase tracking-wide text-muted-foreground">Budget</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  utilization >= 90 ? "bg-red-500" : utilization >= 75 ? "bg-amber-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }}
              />
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatCents(data.summary?.costs.monthSpendCents ?? 0)} /{" "}
              {formatCents(data.summary?.costs.monthBudgetCents ?? 0)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
