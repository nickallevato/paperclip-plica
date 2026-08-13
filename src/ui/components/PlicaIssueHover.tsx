import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "../host/api";
import { PlicaHoverPopover, PlicaIssuePreviewBody } from "./PlicaIssuePreviewCard";

/**
 * Wraps any element; hovering (or focusing within) it ~250ms pops a lazy-
 * fetched issue preview card (identifier, title, status, description).
 * Fetches once per issue and caches a minute — never polled. Rendering is
 * portaled (PlicaHoverPopover) so the card never clips against pane edges.
 */
export function PlicaIssueHover({
  issueId,
  children,
  anchorClassName,
}: {
  issueId: string;
  children: ReactNode;
  anchorClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const issue = useQuery({
    queryKey: ["plica", "issue-hover", issueId],
    queryFn: () => issuesApi.get(issueId),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <PlicaHoverPopover
      open={open}
      onOpenChange={setOpen}
      anchorClassName={anchorClassName}
      content={
        <div data-issue-hover>
          {issue.isLoading ? (
            <p className="text-muted-foreground">Loading ticket…</p>
          ) : issue.data ? (
            <PlicaIssuePreviewBody issue={issue.data} />
          ) : (
            <p className="text-muted-foreground">Ticket unavailable.</p>
          )}
        </div>
      }
    >
      {children}
    </PlicaHoverPopover>
  );
}
