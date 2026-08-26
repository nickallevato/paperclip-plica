import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { CompanyPatternIcon } from "../host/ui-kit";
import { cn } from "../host/util";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

/**
 * A company's slice of a rail, collapsible to a single line.
 *
 * The header carries the summary whether open or shut, so collapsing hides
 * the detail without hiding the fact — a company folded away still shows how
 * much it is holding and whether any of it is late. That is what makes it
 * safe to have no "+n more" cap underneath: a long list is the reader's to
 * fold, not the component's to truncate.
 */
export function PlicaCompanyGroup({
  company,
  count,
  summary,
  tone = "quiet",
  defaultOpen = true,
  children,
}: {
  company: Company;
  count: number;
  /** The one-line reading shown beside the name in both states. */
  summary: ReactNode;
  /** `alert` tints the summary when something in the group is late or failing. */
  tone?: "quiet" | "wait" | "alarm";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <li data-company-group={company.id} data-open={open} className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        title={open ? `Collapse ${company.name}` : `Expand ${company.name}`}
        className="flex w-full min-w-0 items-center gap-2 rounded py-0.5 text-left hover:bg-muted/40"
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <CompanyPatternIcon
          companyName={company.name}
          logoUrl={company.logoUrl}
          brandColor={company.brandColor}
          className="size-4 shrink-0 rounded text-[7px]"
        />
        <span className="min-w-0 flex-1 truncate text-[length:var(--plica-fs-body,14px)] leading-[1.45] font-medium">
          {company.name}
        </span>
        <span className={cn(MICRO, "shrink-0 tabular-nums text-muted-foreground")}>{count}</span>
        <span
          className={cn(
            MICRO,
            "max-w-[55%] shrink-0 truncate",
            tone === "alarm" ? "text-plica-alarm" : tone === "wait" ? "text-plica-wait" : "text-muted-foreground",
          )}
        >
          {summary}
        </span>
      </button>
      {open && <ul className="mt-1 flex flex-col gap-2 pl-5">{children}</ul>}
    </li>
  );
}
