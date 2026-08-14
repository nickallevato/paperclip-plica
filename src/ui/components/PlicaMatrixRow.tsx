import { PinOff } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";
import {
  PLICA_HEALTH_DOT_CLASSES,
  attentionKindSummary,
  derivePaneHealth,
  healthLabel,
} from "../lib/plica";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

/**
 * Solid fills rather than the Signal card's washes: at matrix size a cell is
 * ~22px wide and a 10% tint is indistinguishable from empty.
 */
const CELL_TONE: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-amber-600 text-white",
};

/**
 * One company as a row of severity-coloured cells, one per attention kind.
 * The mode that scales: Signal spends a whole card per company and runs out
 * of room past three or four, where a matrix row costs one line and stays
 * readable at eight. No prose at all, so nothing wraps at kiosk scale.
 */
export function PlicaMatrixRow({
  company,
  data,
  onUnpin,
}: {
  company: Company;
  data: PlicaCompanyData;
  onUnpin?: () => void;
}) {
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary, data.attention);
  const { cells } = attentionKindSummary(data.attention);

  return (
    <tr data-matrix-row={company.id} className="hover:bg-muted/40">
      <td className="py-0.5 pl-2 pr-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <CompanyPatternIcon
            companyName={company.name}
            logoUrl={company.logoUrl}
            brandColor={company.brandColor}
            className="size-4 shrink-0 rounded text-[7px]"
          />
          <span
            data-health={health}
            role="img"
            title={healthLabel(health, data.summary)}
            aria-label={healthLabel(health, data.summary)}
            className={cn("h-2 w-2 shrink-0 rounded-full", PLICA_HEALTH_DOT_CLASSES[health])}
          />
          <span className="min-w-0 truncate text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-medium">
            {company.name}
          </span>
        </div>
      </td>
      {cells.map((cell) => (
        <td key={cell.kind} className="px-0.5 py-0.5 text-center">
          <span
            title={`${company.name} · ${cell.label}: ${cell.count}`}
            className={cn(
              "inline-flex min-h-4 w-full min-w-5 items-center justify-center rounded text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold tabular-nums",
              cell.count === 0
                ? "border border-dashed border-border/60 text-transparent"
                : cell.worst
                  ? (CELL_TONE[cell.worst] ?? "bg-muted text-muted-foreground")
                  : "bg-muted text-muted-foreground",
            )}
          >
            {cell.count}
          </span>
        </td>
      ))}
      <td className="py-0.5 pl-1 pr-2 text-right">
        {onUnpin && (
          <button
            type="button"
            onClick={onUnpin}
            title="Unpin from the bar"
            aria-label={`Unpin ${company.name}`}
            className="rounded-md border p-0.5 text-muted-foreground hover:text-foreground"
          >
            <PinOff className="h-3 w-3" />
          </button>
        )}
      </td>
    </tr>
  );
}
