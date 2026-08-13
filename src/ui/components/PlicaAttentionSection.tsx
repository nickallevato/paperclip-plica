import { AlertTriangle } from "lucide-react";
import type { AttentionFeed, Company } from "@paperclipai/shared";
import { Badge } from "../host/ui-kit";
import { PlicaAttentionCard } from "./PlicaAttentionCard";
import { PlicaLink } from "./PlicaLink";

export function PlicaAttentionSection({
  attention,
  company,
  max = 4,
  hideApprovals = false,
}: {
  attention: AttentionFeed | undefined;
  company: Company;
  max?: number;
  /** While the approvals section is showing the same items, drop
   * approval-sourced entries here so nothing is listed twice. */
  hideApprovals?: boolean;
}) {
  const filtered = (attention?.items ?? []).filter(
    (item) => !item.dismissal && !(hideApprovals && item.sourceKind === "approval"),
  );
  // A quiet pane stays quiet: no header, no badge, no "nothing here" filler —
  // the health dot and chits already say all clear.
  if (filtered.length === 0) return null;
  const items = filtered.slice(0, max);
  const overflow = filtered.length - items.length;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[length:var(--plica-fs-body,0.75rem)] font-medium text-muted-foreground">
        <AlertTriangle className="h-3 w-3" />
        Needs attention
        <Badge variant="outline" className="h-4 rounded-full px-1.5 text-[length:var(--plica-fs-micro,10px)] tabular-nums">
          {filtered.length}
        </Badge>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <PlicaAttentionCard key={item.id} item={item} company={company} />
        ))}
        {overflow > 0 && (
          <li>
            {/* /decisions renders the same attention feed this section reads —
                the inbox only shows a subset of these kinds. */}
            <PlicaLink
              to={`/${company.issuePrefix}/decisions`}
              companyId={company.id}
              className="text-[length:var(--plica-fs-body,0.75rem)] text-muted-foreground hover:text-foreground"
            >
              +{overflow} more →
            </PlicaLink>
          </li>
        )}
      </ul>
    </div>
  );
}
