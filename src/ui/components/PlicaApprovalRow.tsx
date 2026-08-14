import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, ExternalLink, X } from "lucide-react";
import type { Approval, Company } from "@paperclipai/shared";
import { approvalsApi } from "../host/api";
import { Button } from "../host/ui-kit";
import { Textarea } from "../host/ui-kit";
import { useToastActions } from "../host/shims";
import { PlicaLink } from "./PlicaLink";
import { PlicaHoverPopover, PlicaIssuePreviewBody } from "./PlicaIssuePreviewCard";
import { summarizePayloadEntries, relativeTimeLabel } from "../lib/plica";

interface PlicaApprovalRowProps {
  approval: Approval;
  company: Company;
  onActed: () => void;
}

export function PlicaApprovalRow({ approval, company, onActed }: PlicaApprovalRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  // Hover preview of the approval's linked issue(s): lazy-fetched on first
  // hover (never polled) so the wall can be judged without opening anything.
  const [previewOpen, setPreviewOpen] = useState(false);
  const linkedIssues = useQuery({
    queryKey: ["plica", "approval-issues", approval.id],
    queryFn: () => approvalsApi.listIssues(approval.id),
    enabled: previewOpen,
    staleTime: 60_000,
  });
  const { pushToast } = useToastActions();

  const approve = useMutation({
    mutationFn: () => approvalsApi.approve(approval.id, note.trim() ? note.trim() : undefined),
    onSuccess: onActed,
    onError: (mutationError) => {
      pushToast({
        title: "Approval failed",
        body: mutationError instanceof Error ? mutationError.message : "Please try again.",
        tone: "error",
      });
    },
  });
  const reject = useMutation({
    mutationFn: () => approvalsApi.reject(approval.id, note.trim() ? note.trim() : undefined),
    onSuccess: onActed,
    onError: (mutationError) => {
      pushToast({
        title: "Rejection failed",
        body: mutationError instanceof Error ? mutationError.message : "Please try again.",
        tone: "error",
      });
    },
  });

  const entries = summarizePayloadEntries(approval.payload ?? {});
  const busy = approve.isPending || reject.isPending;

  const preview = (
    <div data-approval-preview>
      {linkedIssues.isLoading ? (
        <p className="text-muted-foreground">Loading linked issue…</p>
      ) : (linkedIssues.data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No linked issue for this approval.</p>
      ) : (
        <div className="space-y-2">
          {(linkedIssues.data ?? []).slice(0, 2).map((issue) => (
            <PlicaIssuePreviewBody key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <li className="rounded-md text-[length:var(--plica-fs-body,14px)] leading-[1.45]">
      <div className="flex items-center gap-1.5">
        <PlicaHoverPopover
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          anchorClassName="min-w-0 flex-1"
          content={preview}
        >
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="inline-flex w-full min-w-0 items-center gap-1 truncate text-left"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate font-medium" title={approval.type}>{approval.type}</span>
          </button>
        </PlicaHoverPopover>
        <PlicaLink
          to={`/${company.issuePrefix}/approvals/${approval.id}`}
          companyId={company.id}
          title="Open approval"
          aria-label="Open approval"
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
        </PlicaLink>
        <span
          className="shrink-0 text-muted-foreground"
          title={new Date(approval.createdAt).toLocaleString()}
        >
          {relativeTimeLabel(new Date(approval.createdAt).toISOString(), Date.now())}
        </span>
        {/* Approve/Reject are one-shot opposite actions sitting side by side —
            they keep their text labels so a near-miss can't silently do the
            opposite of what was meant. */}
        <Button
          size="sm"
          variant="secondary"
          className="h-6 px-1.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45]"
          disabled={busy}
          aria-label="Approve"
          onClick={() => approve.mutate()}
        >
          <Check className="mr-0.5 h-3 w-3" /> Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-red-600 dark:text-red-400"
          disabled={busy}
          aria-label="Reject"
          onClick={() => reject.mutate()}
        >
          <X className="mr-0.5 h-3 w-3" /> Reject
        </Button>
      </div>

      {expanded && (
        <div className="ml-4 mt-1 space-y-2 rounded-md border bg-background/60 p-2">
          {entries.length === 0 ? (
            <p className="text-muted-foreground">No payload details.</p>
          ) : (
            <dl className="space-y-0.5">
              {entries.map((entry) => (
                <div key={entry.key} className="flex gap-1">
                  <dt className="shrink-0 font-medium text-muted-foreground">{entry.key}:</dt>
                  <dd className="min-w-0 truncate">{entry.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Decision note (optional)…"
            rows={2}
            className="text-[length:var(--plica-fs-body,14px)] leading-[1.45]"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-6 px-1.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45]"
              disabled={busy}
              onClick={() => approve.mutate()}
            >
              <Check className="mr-0.5 h-3 w-3" /> Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-red-600 dark:text-red-400"
              disabled={busy}
              onClick={() => reject.mutate()}
            >
              <X className="mr-0.5 h-3 w-3" /> Reject
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
