import { AlertTriangle } from "lucide-react";
import type { AttentionFeed, Company } from "@paperclipai/shared";
import { Badge } from "../host/ui-kit";
import { PlicaAttentionCard } from "./PlicaAttentionCard";
import { PlicaAttentionDigest } from "./PlicaAttentionDigest";
import { PlicaAttentionLedgerRow } from "./PlicaAttentionLedgerRow";
import { PlicaLink } from "./PlicaLink";
import { compareAttention, type PlicaRowMode } from "../lib/plica";

export function PlicaAttentionSection({
  attention,
  company,
  max = 4,
  hideApprovals = false,
  rowMode = "card",
}: {
  attention: AttentionFeed | undefined;
  company: Company;
  max?: number;
  /** While the approvals section is showing the same items, drop
   * approval-sourced entries here so nothing is listed twice. */
  hideApprovals?: boolean;
  /** How each item renders — see PlicaRowMode. */
  rowMode?: PlicaRowMode;
}) {
  const filtered = (attention?.items ?? []).filter(
    (item) => !item.dismissal && !(hideApprovals && item.sourceKind === "approval"),
  );
  // A quiet pane stays quiet: no header, no badge, no "nothing here" filler —
  // the health dot and chits already say all clear.
  if (filtered.length === 0) return null;
  // Digest folds by kind, so it is not bounded by `max` — its height already
  // tracks the number of live kinds rather than the number of items.
  const sorted = [...filtered].sort(compareAttention);
  const items = rowMode === "digest" ? sorted : sorted.slice(0, max);
  const overflow = filtered.length - items.length;
  const nowMs = Date.now();

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45] font-medium text-muted-foreground">
        <AlertTriangle className="h-3 w-3" />
        Needs attention
        <Badge variant="outline" className="h-4 rounded-full px-1.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] tabular-nums">
          {filtered.length}
        </Badge>
      </div>
      {rowMode === "digest" ? (
        <PlicaAttentionDigest items={items} company={company} nowMs={nowMs} />
      ) : (
      <ul className={rowMode === "ledger" ? "space-y-0.5" : "space-y-1.5"}>
        {items.map((item) =>
          rowMode === "ledger" ? (
            <PlicaAttentionLedgerRow key={item.id} item={item} company={company} nowMs={nowMs} />
          ) : (
            <PlicaAttentionCard key={item.id} item={item} company={company} />
          ),
        )}
        {overflow > 0 && (
          <li>
            {/* /decisions renders the same attention feed this section reads —
                the inbox only shows a subset of these kinds. */}
            <PlicaLink
              to={`/${company.issuePrefix}/decisions`}
              companyId={company.id}
              className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground hover:text-foreground"
            >
              +{overflow} more →
            </PlicaLink>
          </li>
        )}
      </ul>
      )}
    </div>
  );
}
