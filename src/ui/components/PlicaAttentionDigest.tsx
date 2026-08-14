import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AttentionItem, Company } from "@paperclipai/shared";
import { cn } from "../host/util";
import {
  attentionAgeMinutes,
  attentionRowTitle,
  compareAttention,
  formatAgeMinutes,
  groupAttentionByGroup,
} from "../lib/plica";
import { PlicaAttentionCard } from "./PlicaAttentionCard";
import { PlicaAttentionLedgerRow } from "./PlicaAttentionLedgerRow";
import { PlicaGroupGlyph } from "./PlicaKindGlyph";

/**
 * Attention folded by kind, so a pane's height tracks how many *kinds* are
 * live — bounded, and small — rather than how many items are. A company with
 * thirty items reads like a company with five.
 *
 * Criticals never fold. They are pinned above the groups as full cards,
 * because the whole hazard of grouping is flattening one urgent blocker into
 * the same single line as three routine notices.
 */
export function PlicaAttentionDigest({
  items,
  company,
  nowMs,
}: {
  items: AttentionItem[];
  company: Company;
  nowMs: number;
}) {
  const [openKind, setOpenKind] = useState<string | null>(null);
  const critical = items.filter((item) => item.severity === "critical").sort(compareAttention);
  const groups = groupAttentionByGroup(items.filter((item) => item.severity !== "critical"));

  return (
    <div className="space-y-1.5">
      {critical.length > 0 && (
        <ul data-digest-pinned className="space-y-1.5 rounded-md border border-red-500/40 bg-red-500/[0.06] p-1">
          {critical.map((item) => (
            <PlicaAttentionCard key={item.id} item={item} company={company} />
          ))}
        </ul>
      )}
      {groups.length > 0 && (
        <ul className="space-y-0.5">
          {groups.map((group) => {
            const isOpen = openKind === group.kind;
            const youngest = group.items
              .map((item) => attentionAgeMinutes(item, nowMs))
              .filter((mins): mins is number => mins !== null);
            return (
              <li key={group.kind} data-digest-group={group.kind}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenKind(isOpen ? null : group.kind)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[length:var(--plica-fs-body,14px)] leading-[1.45] hover:bg-muted/40"
                >
                  <PlicaGroupGlyph
                    group={group.kind}
                    className={group.worst === "high" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}
                  />
                  <span className="shrink-0 font-medium capitalize">{group.label}</span>
                  <span className="shrink-0 tabular-nums font-semibold">{group.items.length}</span>
                  {/* One pip per item, coloured by severity: the group's worst
                      case is readable without expanding it. */}
                  <span aria-hidden className="flex shrink-0 items-center gap-0.5">
                    {group.items.slice(0, 6).map((item) => (
                      <i
                        key={item.id}
                        className={cn(
                          "h-1 w-1 rounded-full",
                          item.severity === "high" ? "bg-amber-500" : "bg-muted-foreground/40",
                        )}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {group.items.map((item) => attentionRowTitle(item)).join(" · ")}
                  </span>
                  {youngest.length > 0 && (
                    <span className="shrink-0 tabular-nums text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
                      {formatAgeMinutes(Math.min(...youngest))}
                    </span>
                  )}
                  <ChevronDown
                    className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                  />
                </button>
                {isOpen && (
                  <ul className="space-y-0.5 pl-4">
                    {group.items.map((item) => (
                      <PlicaAttentionLedgerRow key={item.id} item={item} company={company} nowMs={nowMs} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
