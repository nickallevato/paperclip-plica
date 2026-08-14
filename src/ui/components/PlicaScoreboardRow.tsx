import { PinOff } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";
import {
  PLICA_HEALTH_DOT_CLASSES,
  derivePaneHealth,
  formatAgeMinutes,
  formatTokens,
  healthLabel,
  tokenState,
  type PlicaCompanyStats,
  type PlicaTokenThresholds,
} from "../lib/plica";
import type { PlicaCompanyData } from "./usePlicaCompanyData";

/** The columns, in order. Kept beside the row so the header can't drift from it. */
export const PLICA_SCOREBOARD_COLUMNS = [
  "Agents",
  "Tasks",
  "Needs you",
  "Crit",
  "Failed",
  "Oldest",
  "Tokens",
  "Inbox",
] as const;

/**
 * A number that only earns colour when it crosses a line. Everything else
 * stays in ink, and zeroes recede — a row of bold figures would hide the two
 * that matter.
 */
function Cell({ value, tone, faint }: { value: string | number; tone?: "warn" | "crit"; faint?: boolean }) {
  return (
    <td
      className={cn(
        "px-2 py-1 text-right tabular-nums",
        tone === "crit" && "font-bold text-red-600 dark:text-red-400",
        tone === "warn" && "font-semibold text-amber-700 dark:text-amber-300",
        !tone && faint && "text-muted-foreground/50",
      )}
    >
      {value}
    </td>
  );
}

/**
 * One company's whole operational state as a row of aligned numbers — the
 * mode you scan by column rather than by card. Matrix answers "what kind of
 * attention"; this answers "how is everything", which is a different question
 * and wants every fact side by side.
 */
export function PlicaScoreboardRow({
  company,
  data,
  stats,
  thresholds,
  onUnpin,
}: {
  company: Company;
  data: PlicaCompanyData;
  stats: PlicaCompanyStats;
  thresholds: PlicaTokenThresholds;
  onUnpin?: () => void;
}) {
  const health = data.unavailable ? "red" : derivePaneHealth(data.summary);
  const tokens = stats.tokens;
  const tokenTone = tokens === undefined ? undefined : tokenState(tokens, thresholds);

  return (
    <tr data-scoreboard-row={company.id} className="border-t hover:bg-muted/40">
      <td className="py-1 pl-2 pr-2">
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
          <span className="min-w-0 truncate font-medium">{company.name}</span>
        </div>
      </td>
      <td className="px-2 py-1 text-right tabular-nums">
        {stats.running}
        <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">/{stats.active}</span>
      </td>
      <Cell value={stats.tasks} faint={stats.tasks === 0} />
      <Cell value={stats.needs} tone={stats.needs > 0 ? "warn" : undefined} faint={stats.needs === 0} />
      <Cell value={stats.critical} tone={stats.critical > 0 ? "crit" : undefined} faint={stats.critical === 0} />
      <Cell value={stats.failed} tone={stats.failed > 0 ? "warn" : undefined} faint={stats.failed === 0} />
      <Cell
        value={formatAgeMinutes(stats.oldestMins)}
        // Anything untouched for half a day is the neglect case no count surfaces.
        tone={stats.oldestMins !== null && stats.oldestMins > 720 ? "warn" : undefined}
        faint={stats.oldestMins === null}
      />
      <Cell
        value={tokens === undefined ? "—" : formatTokens(tokens)}
        tone={tokenTone === "ok" ? undefined : tokenTone}
        faint={tokens === undefined}
      />
      <Cell value={stats.inbox} faint={stats.inbox === 0} />
      <td className="py-1 pl-1 pr-2 text-right">
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
