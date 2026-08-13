import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import type { Agent, Company, Issue } from "@paperclipai/shared";
import { issuesApi } from "../host/api";
import { Button } from "../host/ui-kit";
import { Popover, PopoverContent, PopoverTrigger } from "../host/ui-kit";
import { Textarea } from "../host/ui-kit";
import { useToastActions } from "../host/shims";
import { nudgeTitle } from "../lib/plica";

interface PlicaCeoNudgeProps {
  company: Company;
  ceo: Agent;
  onActed: () => void;
}

export function PlicaCeoNudge({ company, ceo, onActed }: PlicaCeoNudgeProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { pushToast } = useToastActions();

  const nudge = useMutation({
    mutationFn: () =>
      issuesApi.create(company.id, {
        title: nudgeTitle(text),
        description: text,
        priority: "high",
        assigneeAgentId: ceo.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (created: Issue) => {
      setText("");
      setOpen(false);
      pushToast({
        title: `Nudge sent to ${ceo.name}`,
        body: created.identifier ?? created.id,
      });
      onActed();
    },
    onError: (mutationError) => {
      // Keep the popover open with the typed draft so the user can retry.
      pushToast({
        title: "Nudge failed to send",
        body: mutationError instanceof Error ? mutationError.message : "Please try again.",
        tone: "error",
      });
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0" aria-label={`Nudge ${ceo.name}`}>
          <Send className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`Nudge ${ceo.name}…`}
          rows={3}
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!nudgeTitle(text) || nudge.isPending} onClick={() => nudge.mutate()}>
            <Send className="mr-1 h-3 w-3" /> Send
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
