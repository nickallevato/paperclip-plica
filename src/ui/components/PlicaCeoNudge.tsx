import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import type { Agent, Company, Issue } from "@paperclipai/shared";
import { issuesApi } from "../host/api";
import { useToastActions } from "../host/shims";
import { Button, CompanyPatternIcon, Dialog, DialogContent, DialogTrigger, Textarea } from "../host/ui-kit";
import { cn } from "../host/util";
import { clearDraft, loadDraft, nudgeDraftKeyFor, useDraftSaver } from "../lib/drafts";
import { nudgeTitle } from "../lib/plica";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";
const BODY = "text-[length:var(--plica-fs-body,14px)] leading-[1.45]";

const PRIORITIES = [
  { value: "critical", label: "Critical", dot: "bg-red-500" },
  { value: "high", label: "High", dot: "bg-amber-500" },
  { value: "medium", label: "Medium", dot: "bg-sky-500" },
  { value: "low", label: "Low", dot: "bg-muted-foreground/50" },
] as const;
type Priority = (typeof PRIORITIES)[number]["value"];

interface PlicaCeoNudgeProps {
  company: Company;
  ceo: Agent;
  onActed: () => void;
}

interface NudgeDraft {
  text: string;
  title: string;
  priority: Priority;
}

/**
 * A nudge is a new task for the CEO: the same shape as the host's New Task
 * dialog (title, description, priority) with the assignee fixed. The title
 * follows the first line of the message unless you type your own.
 */
export function PlicaCeoNudge({ company, ceo, onActed }: PlicaCeoNudgeProps) {
  const [open, setOpen] = useState(false);
  const draftKey = nudgeDraftKeyFor(company.id, ceo.id);
  const [restored] = useState(() => loadDraft<NudgeDraft>(draftKey));
  const [text, setText] = useState(restored?.text ?? "");
  const [title, setTitle] = useState(restored?.title ?? "");
  const [priority, setPriority] = useState<Priority>(restored?.priority ?? "high");
  const { pushToast } = useToastActions();
  const derivedTitle = nudgeTitle(text);
  const effectiveTitle = nudgeTitle(title) || derivedTitle;
  useDraftSaver(draftKey, { text, title, priority } satisfies NudgeDraft, !text.trim() && !title.trim());

  const nudge = useMutation({
    mutationFn: () =>
      issuesApi.create(company.id, {
        title: effectiveTitle,
        description: text,
        priority,
        assigneeAgentId: ceo.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (created: Issue) => {
      setText("");
      setTitle("");
      setPriority("high");
      clearDraft(draftKey);
      setOpen(false);
      pushToast({
        title: `Nudge sent to ${ceo.name}`,
        body: created.identifier ?? created.id,
      });
      onActed();
    },
    onError: (mutationError) => {
      // Keep the dialog open with the typed draft so the user can retry.
      pushToast({
        title: "Nudge failed to send",
        body: mutationError instanceof Error ? mutationError.message : "Please try again.",
        tone: "error",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0" aria-label={`Nudge ${ceo.name}`}>
          <Send className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Nudge ${ceo.name}`}
        description={
          <span className="inline-flex items-center gap-1.5">
            <CompanyPatternIcon
              companyName={company.name}
              logoUrl={company.logoUrl}
              brandColor={company.brandColor}
              className="size-3.5 rounded text-[8px]"
            />
            new task in {company.name} · assigned to {ceo.name}
          </span>
        }
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (effectiveTitle && !nudge.isPending) nudge.mutate();
          }}
        >
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={derivedTitle || "Task title"}
            aria-label="Task title"
            maxLength={140}
            className={cn(
              "w-full rounded-md border bg-transparent px-2.5 py-1.5 font-medium outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring",
              BODY,
            )}
          />
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`What should ${ceo.name} do?`}
            rows={5}
            autoFocus
            className={BODY}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span role="group" aria-label="Priority" className="flex items-center rounded-md border p-0.5">
              {PRIORITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={priority === option.value}
                  onClick={() => setPriority(option.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-0.5",
                    MICRO,
                    priority === option.value ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", option.dot)} />
                  {option.label}
                </button>
              ))}
            </span>
            <span className={cn("text-muted-foreground", MICRO)}>
              {restored && (text || title) ? "draft restored · " : ""}
              {title.trim() ? "" : derivedTitle ? "title from first line" : ""}
            </span>
            <Button type="submit" size="sm" className={cn("ml-auto h-7 px-3", MICRO)} disabled={!effectiveTitle || nudge.isPending}>
              {nudge.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              Send
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
