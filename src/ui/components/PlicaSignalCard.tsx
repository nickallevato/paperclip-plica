import { useState } from "react";
import { PinOff } from "lucide-react";
import type { AttentionItem, Company } from "@paperclipai/shared";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";
import {
  PLICA_HEALTH_DOT_CLASSES,
  attentionGroupFor,
  attentionGroupSummary,
  derivePaneHealth,
  healthLabel,
} from "../lib/plica";
import { PlicaAttentionCard } from "./PlicaAttentionCard";
import { PlicaGroupGlyph } from "./PlicaKindGlyph";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

/**
 * Severity tint for a kind cell. Only critical and high earn a colour — a
 * wall of amber cells says nothing, so medium and low sit in the neutral
 * treatment and are read by their count alone.
 */
const CELL_TONE: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10",
  high: "border-amber-500/40 bg-amber-500/10",
};

const VALUE_TONE: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-amber-700 dark:text-amber-300",
};

/**
 * A pinned company as a grid of labelled counts: one cell per attention kind,
 * tinted by that kind's worst severity, with the whole feed rolled up into a
 * total. Answers "what kind of thing needs me here" without reading any prose,
 * which is what a bar you glance at has to do.
 *
 * Clicking a non-empty cell drills into that kind's items in place. In place
 * rather than navigating because the company is pinned precisely so it stays
 * put — sending you elsewhere would defeat the pin.
 */
export function PlicaSignalCard({
  company,
  data,
  onUnpin,
}: {
  company: Company;
  data: PlicaCompanyData;
  onUnpin?: () => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary, data.attention);
  const { cells, total } = attentionGroupSummary(data.attention);
  const drilled = openGroup
    ? (data.attention?.items ?? []).filter(
        (item) => !item.dismissal && attentionGroupFor(item.sourceKind)?.key === openGroup,
      )
    : [];

  return (
    <div
      data-signal-card={company.id}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-2.5",
        health === "green" && "border-l-4 border-l-emerald-500",
        health === "amber" && "border-l-4 border-l-amber-500",
        health === "red" && "border-l-4 border-l-red-500 bg-red-500/[0.03]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <CompanyPatternIcon
          companyName={company.name}
          logoUrl={company.logoUrl}
          brandColor={company.brandColor}
          className="size-5 shrink-0 rounded-md text-[8px]"
        />
        <span className="min-w-0 truncate text-[length:var(--plica-fs-body,14px)] leading-[1.45] font-semibold">
          {company.name}
        </span>
        <span
          data-health={health}
          role="img"
          title={healthLabel(health, data.summary)}
          aria-label={healthLabel(health, data.summary)}
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PLICA_HEALTH_DOT_CLASSES[health])}
        />
        <span
          data-signal-total
          className={cn(
            "ml-auto shrink-0 rounded-full px-1.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold tabular-nums",
            total === 0
              ? health === "green"
                ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border text-muted-foreground"
              : health === "red"
                ? "bg-red-600 text-white"
                : "bg-amber-600 text-white",
          )}
        >
          {total}
        </span>
        {onUnpin && (
          <button
            type="button"
            onClick={onUnpin}
            title="Unpin from the bar"
            aria-label={`Unpin ${company.name}`}
            className="shrink-0 rounded-md border p-1 text-muted-foreground hover:text-foreground"
          >
            <PinOff className="h-3 w-3" />
          </button>
        )}
      </div>

      {data.unavailable ? (
        <p className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-red-700 dark:text-red-300">
          Unreachable — no data yet
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {cells.map((cell) => {
            const tone = cell.worst ? CELL_TONE[cell.worst] : undefined;
            const isOpen = openGroup === cell.key;
            return (
              <button
                key={cell.key}
                type="button"
                disabled={cell.count === 0}
                aria-expanded={cell.count === 0 ? undefined : isOpen}
                title={`${cell.label}: ${cell.count}`}
                onClick={() => setOpenGroup(isOpen ? null : cell.key)}
                className={cn(
                  "flex min-w-0 flex-col items-start rounded-md border px-1.5 py-1 text-left",
                  cell.count === 0
                    ? "border-dashed border-border/60 bg-transparent"
                    : cn("bg-muted/40 hover:bg-muted/70", tone),
                  isOpen && "ring-1 ring-ring",
                )}
              >
                <span className="flex w-full items-center gap-1">
                  <PlicaGroupGlyph
                    group={cell.key}
                    className={cn(cell.worst ? VALUE_TONE[cell.worst] : "text-muted-foreground")}
                  />
                  <span
                    className={cn(
                      "ml-auto tabular-nums",
                      cell.count === 0
                        ? "text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground"
                        : cn(
                            "text-[length:var(--plica-fs-stat,16px)] leading-[1.25] font-semibold",
                            cell.worst ? VALUE_TONE[cell.worst] : undefined,
                          ),
                    )}
                  >
                    {cell.count}
                  </span>
                </span>
                <span className="w-full truncate text-[length:var(--plica-fs-micro,11px)] leading-[1.45] uppercase tracking-wide text-muted-foreground">
                  {cell.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {drilled.length > 0 && (
        <ul data-signal-drill className="space-y-1.5 border-t pt-2">
          {drilled.map((item) => (
            <PlicaAttentionCard key={item.id} item={item} company={company} />
          ))}
        </ul>
      )}
    </div>
  );
}
