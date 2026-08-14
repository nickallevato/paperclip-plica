import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { dashboardApi } from "../host/api";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";
import { PLICA_HEALTH_DOT_CLASSES, derivePaneHealth, healthLabel, plicaRefetchInterval } from "../lib/plica";
import { queryKeys } from "../host/util";

/**
 * A collapsed ("docked") company: lives outside the wall grid so panes
 * reflow, keeps only the cheap summary poll alive so its health dot stays
 * honest while docked. A docked company that turns red escalates the whole
 * tile — an 8px dot alone is invisible in the dock strip.
 */
export function PlicaDockedTile({ company, onExpand }: { company: Company; onExpand: () => void }) {
  const summary = useQuery({
    queryKey: queryKeys.plica.summary(company.id),
    queryFn: () => dashboardApi.summary(company.id),
    refetchInterval: plicaRefetchInterval,
    refetchIntervalInBackground: true,
  });
  const health = summary.isError && summary.dataUpdatedAt === 0 ? "red" : derivePaneHealth(summary.data);
  const attentionCount =
    (summary.data?.pendingApprovals ?? 0) +
    (summary.data?.budgets.activeIncidents ?? 0) +
    (summary.data?.agents.error ?? 0);

  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Expand ${company.name} — ${healthLabel(health, summary.data)}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2 text-[length:var(--plica-fs-body,14px)] leading-[1.45]",
        health === "red"
          ? "border-red-500/40 bg-red-500/10 hover:bg-red-500/20"
          : "bg-muted/20 hover:bg-muted/40",
      )}
    >
      <CompanyPatternIcon
        companyName={company.name}
        logoUrl={company.logoUrl}
        brandColor={company.brandColor}
        className="size-4 shrink-0 rounded text-[7px]"
      />
      <span className="max-w-32 truncate font-medium">{company.name}</span>
      {health !== "green" && attentionCount > 0 && (
        <span
          data-docked-count
          className={cn(
            "inline-flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold tabular-nums text-white",
            health === "red" ? "bg-red-600" : "bg-amber-600",
          )}
        >
          {attentionCount}
        </span>
      )}
      <span
        data-health={health}
        role="img"
        aria-label={healthLabel(health, summary.data)}
        className={cn("h-2 w-2 shrink-0 rounded-full", PLICA_HEALTH_DOT_CLASSES[health])}
      />
      <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}
