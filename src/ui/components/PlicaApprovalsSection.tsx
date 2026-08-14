import { SquareCheckBig } from "lucide-react";
import type { Approval, Company } from "@paperclipai/shared";
import { Badge } from "../host/ui-kit";
import { PlicaApprovalRow } from "./PlicaApprovalRow";
import { PlicaLink } from "./PlicaLink";

const MAX_VISIBLE = 3;

export function PlicaApprovalsSection({ approvals, company, open, onActed }: {
  approvals: Approval[];
  company: Company;
  open: boolean;
  onActed: () => void;
}) {
  if (!open || approvals.length === 0) return null;
  const visible = approvals.slice(0, MAX_VISIBLE);
  const overflow = approvals.length - visible.length;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45] font-medium text-muted-foreground">
        <SquareCheckBig className="h-3 w-3" />
        Approvals
        <Badge variant="outline" className="h-4 rounded-full px-1.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] tabular-nums">
          {approvals.length}
        </Badge>
      </div>
      <ul className="space-y-1 rounded-md border bg-muted/20 p-2">
        {visible.map((approval) => (
          <PlicaApprovalRow key={approval.id} approval={approval} company={company} onActed={onActed} />
        ))}
        {overflow > 0 && (
          <li>
            <PlicaLink
              to={`/${company.issuePrefix}/approvals`}
              companyId={company.id}
              className="text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground hover:text-foreground"
            >
              +{overflow} more →
            </PlicaLink>
          </li>
        )}
      </ul>
    </div>
  );
}
