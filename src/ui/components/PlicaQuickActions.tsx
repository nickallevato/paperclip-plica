import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@paperclipai/shared";
import { issuesApi } from "../host/api";
import { Button } from "../host/ui-kit";
import { useToastActions } from "../host/shims";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../host/ui-kit";
import { Popover, PopoverContent, PopoverTrigger } from "../host/ui-kit";
import { Textarea } from "../host/ui-kit";
import { issueStatusLabel } from "../lib/plica";

interface PlicaQuickActionsProps {
  issueId: string;
  issueStatus?: string;
  onActed: () => void;
}

export function PlicaQuickActions({ issueId, issueStatus, onActed }: PlicaQuickActionsProps) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [body, setBody] = useState("");
  const { pushToast } = useToastActions();

  const comment = useMutation({
    mutationFn: () => issuesApi.addComment(issueId, body),
    onSuccess: () => {
      setBody("");
      setCommentOpen(false);
      onActed();
    },
    onError: (mutationError) => {
      // Keep the popover open with the typed comment so the user doesn't
      // lose it and can retry.
      pushToast({
        title: "Comment failed to send",
        body: mutationError instanceof Error ? mutationError.message : "Please try again.",
        tone: "error",
      });
    },
  });

  const update = useMutation({
    mutationFn: (data: Record<string, unknown>) => issuesApi.update(issueId, data),
    onSuccess: onActed,
    onError: (mutationError) => {
      pushToast({
        title: "Update failed",
        body: mutationError instanceof Error ? mutationError.message : "Please try again.",
        tone: "error",
      });
    },
  });

  return (
    <span className="inline-flex items-center gap-1">
      <Popover open={commentOpen} onOpenChange={setCommentOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[length:var(--plica-fs-body,0.75rem)]">
            <MessageSquarePlus className="mr-1 h-3 w-3" /> Comment
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a comment…"
            rows={3}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" disabled={!body.trim() || comment.isPending} onClick={() => comment.mutate()}>
              Send
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {issueStatus !== undefined && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[length:var(--plica-fs-body,0.75rem)]">
              {issueStatusLabel(issueStatus)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {ISSUE_STATUSES.map((status) => (
              <DropdownMenuItem key={status} onSelect={() => update.mutate({ status })}>
                {issueStatusLabel(status)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Priority</DropdownMenuLabel>
            {ISSUE_PRIORITIES.map((priority) => (
              <DropdownMenuItem key={priority} onSelect={() => update.mutate({ priority })}>
                {issueStatusLabel(priority)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </span>
  );
}
