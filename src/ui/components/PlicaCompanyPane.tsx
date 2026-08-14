import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronsDownUp,
  CircleDollarSign,
  ExternalLink,
  ListTodo,
  Pin,
  Plus,
} from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { Badge } from "../host/ui-kit";
import { Button } from "../host/ui-kit";
import { Card, CardContent, CardHeader, CardTitle } from "../host/ui-kit";
import { useDialogActions } from "../host/shims";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";
import { Inbox as InboxIcon, OctagonX } from "lucide-react";
import {
  PLICA_HEALTH_DOT_CLASSES,
  deriveActionable,
  deriveCeoHeartbeat,
  derivePaneHealth,
  formatCents,
  healthLabel,
  selectCeo,
  selectProjectChips,
  type PlicaRowMode,
} from "../lib/plica";
import { PlicaApprovalsSection } from "./PlicaApprovalsSection";
import { PlicaAttentionSection } from "./PlicaAttentionSection";
import { PlicaCeoStrip } from "./PlicaCeoStrip";
import { PlicaRunsStrip } from "./PlicaRunsStrip";
import { PlicaSparkline } from "./PlicaSparkline";
import { PlicaLink } from "./PlicaLink";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

// Troubled panes get a colored left edge + faint wash so they pop at wall
// scale; green panes keep the plain border and recede.
const HEALTH_FRAME_CLASSES: Record<string, string> = {
  green: "",
  amber: "border-l-4 border-l-amber-500",
  red: "border-l-4 border-l-red-500 bg-red-500/[0.03]",
};

function mainUiHref(company: Company, path: string): string {
  return `/${company.issuePrefix}${path}`;
}

export function PlicaCompanyPane({
  company,
  data,
  pulse = false,
  onToggleCollapse,
  onTogglePin,
  rowMode,
}: {
  company: Company;
  data: PlicaCompanyData;
  pulse?: boolean;
  /** Docks the company out of the wall into the compact strip. */
  onToggleCollapse?: () => void;
  /** Pins the company up into the bar, hoisting it out of the wall. */
  onTogglePin?: () => void;
  /** How attention items render inside this pane. */
  rowMode?: PlicaRowMode;
}) {
  // Tri-state: null = automatic (show whenever approvals are pending — the
  // wall should let you approve without an extra click); true/false = the
  // user explicitly toggled via the Approvals stat.
  const [approvalsOpen, setApprovalsOpen] = useState<boolean | null>(null);
  const { openNewIssue } = useDialogActions();
  // An unavailable pane (first poll failed, no data ever received) must
  // never read as healthy — override the derived health rather than let
  // derivePaneHealth(undefined) default to "green".
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary);
  const isFirstLoad = data.isLoading && !data.unavailable && data.summary === undefined;
  const { chips, overflow } = selectProjectChips(data.projects, data.issues);
  const ceoOverdue = deriveCeoHeartbeat(selectCeo(data.agents), Date.now()).state === "overdue";
  const actionable = deriveActionable({ approvals: data.approvals, attention: data.attention, ceoOverdue });
  const approvalsShown = approvalsOpen ?? data.approvals.length > 0;

  return (
    <Card
      data-pulse={pulse}
      className={cn(
        "relative flex h-full flex-col gap-3 py-4",
        HEALTH_FRAME_CLASSES[health],
        pulse && "ring-2 ring-red-500",
      )}
    >
      {/* Alert pulse lives on an overlay so the pane's content never dims
          with it — the ring throbs, the text stays readable. */}
      {pulse && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-pulse rounded-[inherit] ring-2 ring-red-500 motion-reduce:animate-none"
        />
      )}
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 px-4">
        <div className="flex min-w-0 items-center gap-2">
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
          {actionable.count > 0 && (
            <span
              data-actionable-count
              title={`${actionable.count} item${actionable.count === 1 ? "" : "s"} need${actionable.count === 1 ? "s" : ""} you`}
              className={cn(
                "inline-flex min-h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold tabular-nums text-white",
                actionable.criticalOrHigh ? "bg-red-600" : "bg-amber-600",
              )}
            >
              {actionable.count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <PlicaSparkline runActivity={data.summary?.runActivity ?? []} />
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title="Pin to the bar"
              aria-label={`Pin ${company.name} to the bar`}
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Pin className="h-3 w-3" />
              Pin
            </button>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Dock company"
              aria-label="Dock company"
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </button>
          )}
          <PlicaLink to={mainUiHref(company, "/dashboard")} companyId={company.id} className="inline-flex items-center gap-1 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground hover:text-foreground">
            Open <ExternalLink className="h-3 w-3" />
          </PlicaLink>
        </div>
      </CardHeader>

      {data.unavailable && (
        <div className="mx-4 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-red-700 dark:text-red-300">
          Unreachable — no data yet
        </div>
      )}

      {!data.unavailable && data.staleSince !== null && (
        <div className="mx-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-amber-700 dark:text-amber-300">
          Stale since {new Date(data.staleSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {data.unavailable ? (
        <CardContent className="flex flex-1 items-start px-4">
          <p className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">
            This company's data could not be loaded. It will retry automatically.
          </p>
        </CardContent>
      ) : isFirstLoad ? (
        <CardContent className="flex flex-1 items-start px-4">
          <p className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">Loading…</p>
        </CardContent>
      ) : (
      <CardContent className="flex flex-1 flex-col gap-3 px-4">
        <PlicaCeoStrip agents={data.agents} company={company} onActed={data.invalidate} />
        <div className="grid grid-cols-4 gap-1.5">
            <PaneStat
              icon={Bot}
              value={`${data.summary?.agents.running ?? 0}/${data.summary?.agents.active ?? 0}`}
              microLabel="agents"
              label="Agents running / active"
              href={mainUiHref(company, "/agents/all")}
              companyId={company.id}
            />
            <PaneStat
              icon={ListTodo}
              value={data.summary?.tasks.inProgress ?? 0}
              microLabel="tasks"
              label="Tasks in progress"
              href={mainUiHref(company, "/issues")}
              companyId={company.id}
            />
            <PaneStat
              icon={CheckCircle2}
              value={data.summary?.pendingApprovals ?? 0}
              microLabel="appr"
              label="Pending approvals"
              hot={(data.summary?.pendingApprovals ?? 0) > 0}
              expanded={approvalsShown}
              onClick={() => setApprovalsOpen((v) => !(v ?? (data.approvals.length > 0)))}
            />
            <PaneStat
              icon={CircleDollarSign}
              value={formatCents(data.summary?.costs.monthSpendCents ?? 0)}
              microLabel="spend"
              label={`Month spend of ${formatCents(data.summary?.costs.monthBudgetCents ?? 0)} budget`}
              ghost
              hot={(data.summary?.costs.monthUtilizationPercent ?? 0) >= 80}
            />
        </div>

        <PlicaApprovalsSection
          approvals={data.approvals}
          company={company}
          open={approvalsShown}
          onActed={data.invalidate}
        />

        <PlicaAttentionSection
          attention={data.attention}
          company={company}
          hideApprovals={approvalsShown && data.approvals.length > 0}
          rowMode={rowMode}
        />

        <PlicaRunsStrip runs={data.liveRuns} issues={data.issues} company={company} onActed={data.invalidate} />

        {(chips.length > 0 || overflow > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map(({ project, openCount }) => (
              <PlicaLink key={project.id} to={mainUiHref(company, `/projects/${project.urlKey}`)} companyId={company.id}>
                <Badge variant="outline" className="gap-1.5 font-normal">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: project.color ?? "var(--muted-foreground)" }}
                  />
                  {project.name}
                  <span className="text-muted-foreground">{openCount}</span>
                </Badge>
              </PlicaLink>
            ))}
            {overflow > 0 && (
              <PlicaLink to={mainUiHref(company, "/projects")} companyId={company.id} className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground hover:text-foreground">
                +{overflow} more
              </PlicaLink>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
          <Button size="sm" variant="secondary" onClick={() => openNewIssue({ companyId: company.id, companyPrefix: company.issuePrefix })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Ticket
          </Button>
          <div className="flex items-center gap-1.5">
            <FooterBadge
              icon={InboxIcon}
              label="Inbox"
              count={data.badges?.inbox ?? 0}
              href={mainUiHref(company, "/inbox")}
              companyId={company.id}
            />
            <FooterBadge
              icon={OctagonX}
              label="Failed"
              count={data.badges?.failedRuns ?? 0}
              href={mainUiHref(company, "/agents/all")}
              companyId={company.id}
              alarming
            />
            <PlicaLink to={mainUiHref(company, "/issues")} companyId={company.id} className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground hover:text-foreground">
              All issues →
            </PlicaLink>
          </div>
        </div>
      </CardContent>
      )}
    </Card>
  );
}

function FooterBadge({
  icon: Icon,
  label,
  count,
  href,
  companyId,
  alarming = false,
}: {
  icon: typeof Bot;
  label: string;
  count: number;
  href: string;
  companyId?: string;
  /** Amber is reserved for badges that mean "act" (failed runs) — an inbox
   * with items is normal life and stays neutral. */
  alarming?: boolean;
}) {
  return (
    <PlicaLink to={href} companyId={companyId} className={cn( "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45] tabular-nums", count > 0
          ? alarming
            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            : "border-border text-foreground hover:bg-muted/40"
          : "border-border text-muted-foreground hover:bg-muted/40",
      )}
    >
      <Icon className="h-3 w-3" />
      {label} {count}
    </PlicaLink>
  );
}

function PaneStat({
  icon: Icon,
  value,
  label,
  microLabel,
  onClick,
  href,
  companyId,
  ghost,
  hot,
  expanded,
}: {
  icon: typeof Bot;
  value: string | number;
  /** Full description (tooltip + accessible name). */
  label: string;
  /** Always-visible one-word label — kiosk/touch can't hover a title. */
  microLabel: string;
  onClick?: () => void;
  href?: string;
  companyId?: string;
  /** Visually recessive cell (dashed hairline, muted, unbolded) for low-priority stats. */
  ghost?: boolean;
  /** Re-emphasize a cell when its stat needs attention (approvals pending, budget nearly spent). */
  hot?: boolean;
  /** For toggle chits: current open state, shown via a rotating chevron. */
  expanded?: boolean;
}) {
  const className = cn(
    "flex flex-col items-start rounded-md border px-1.5 py-1 text-left",
    ghost ? "border-dashed border-border/60 bg-transparent" : "bg-muted/30",
    (onClick || href) && "cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted/60",
    hot && "border-solid border-amber-500/40 bg-amber-500/10",
  );
  const body = (
    <>
      <span className="flex w-full items-center gap-1">
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "min-w-0 truncate tabular-nums",
            hot
              ? "text-[length:var(--plica-fs-stat,16px)] leading-[1.25] font-semibold text-amber-700 dark:text-amber-300"
              : ghost
                ? "text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground"
                : "text-[length:var(--plica-fs-stat,16px)] leading-[1.25] font-semibold",
          )}
        >
          {value}
        </span>
        {expanded !== undefined && (
          <ChevronDown
            className={cn(
              "ml-auto h-3 w-3 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        )}
      </span>
      <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] uppercase tracking-wide text-muted-foreground">{microLabel}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={label} aria-label={label} aria-expanded={expanded} className={className}>
        {body}
      </button>
    );
  }
  if (href) {
    return (
      <PlicaLink to={href} companyId={companyId} title={label} aria-label={label} className={className}>
        {body}
      </PlicaLink>
    );
  }
  return (
    <div role="group" title={label} aria-label={label} className={className}>
      {body}
    </div>
  );
}
