import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import type {
  AskUserQuestionsInteraction,
  AttentionItem,
  IssueThreadInteraction,
  RequestCheckboxConfirmationInteraction,
} from "@paperclipai/shared";
import { issuesApi } from "../host/api";
import { useToastActions } from "../host/shims";
import { Button, Popover, PopoverContent, PopoverTrigger, Textarea } from "../host/ui-kit";
import { cn } from "../host/util";
import { attentionIssueId } from "../lib/plica";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";
const BODY = "text-[length:var(--plica-fs-body,14px)] leading-[1.45]";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

/** The verb labels the server attached (e.g. "The deploy is done" / "I did not run the deploy"). */
function verbLabel(item: AttentionItem, id: string, fallback: string): string {
  return item.decisionVerbs?.find((verb) => verb.id === id)?.label ?? fallback;
}

/**
 * Resolves a thread interaction from the rail without leaving the page.
 *
 * A plain confirmation is two buttons. Questions and checkbox confirmations
 * need their payload (which the attention feed does not carry), so those open
 * a popover that fetches the issue's interactions on demand and renders the
 * form. Kinds with no inline form here render nothing — the caller keeps its
 * Open link for them.
 */
export function PlicaInteractionActions({ item, onActed }: { item: AttentionItem; onActed: () => void }) {
  const issueId = attentionIssueId(item);
  const kind = item.subject.metadata?.kind;
  if (!issueId || item.subject.kind !== "interaction") return null;
  const interactionId = item.subject.id;
  if (kind === "request_confirmation") {
    return <ConfirmButtons item={item} issueId={issueId} interactionId={interactionId} onActed={onActed} />;
  }
  if (kind === "ask_user_questions" || kind === "request_checkbox_confirmation") {
    return (
      <InteractionFormPopover
        item={item}
        issueId={issueId}
        interactionId={interactionId}
        label={kind === "ask_user_questions" ? "Answer" : "Choose"}
        onActed={onActed}
      />
    );
  }
  return null;
}

export function hasInlineInteraction(item: AttentionItem): boolean {
  const kind = item.subject.metadata?.kind;
  return (
    item.subject.kind === "interaction" &&
    attentionIssueId(item) !== null &&
    (kind === "request_confirmation" || kind === "ask_user_questions" || kind === "request_checkbox_confirmation")
  );
}

function ConfirmButtons({
  item,
  issueId,
  interactionId,
  onActed,
}: {
  item: AttentionItem;
  issueId: string;
  interactionId: string;
  onActed: () => void;
}) {
  const { pushToast } = useToastActions();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const accept = useMutation({
    mutationFn: () => issuesApi.acceptInteraction(issueId, interactionId),
    onSuccess: () => {
      pushToast({ title: "Confirmed", tone: "success" });
      onActed();
    },
    onError: (error) => pushToast({ title: "Could not confirm", body: errorMessage(error), tone: "error" }),
  });
  const reject = useMutation({
    mutationFn: () => issuesApi.rejectInteraction(issueId, interactionId, reason.trim() || undefined),
    onSuccess: () => {
      pushToast({ title: "Declined", tone: "success" });
      setDeclineOpen(false);
      onActed();
    },
    onError: (error) => pushToast({ title: "Could not decline", body: errorMessage(error), tone: "error" }),
  });
  const busy = accept.isPending || reject.isPending;
  const acceptLabel = verbLabel(item, "accept", "Confirm");
  const rejectLabel = verbLabel(item, "reject", "Decline");
  return (
    <>
      <Button
        size="sm"
        variant="default"
        className={cn("h-6 max-w-40 truncate px-2 font-medium", MICRO)}
        disabled={busy}
        aria-label={acceptLabel}
        title={acceptLabel}
        onClick={() => accept.mutate()}
      >
        {accept.isPending ? <Loader2 className="mr-0.5 h-3 w-3 animate-spin" /> : <Check className="mr-0.5 h-3 w-3" />}
        {acceptLabel}
      </Button>
      <Popover open={declineOpen} onOpenChange={setDeclineOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-6 max-w-40 truncate px-2 text-red-600 dark:text-red-400", MICRO)}
            disabled={busy}
            aria-label={rejectLabel}
            title={rejectLabel}
          >
            <X className="mr-0.5 h-3 w-3" /> {rejectLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional)"
            rows={3}
            className={BODY}
          />
          <div className="mt-2 flex justify-end gap-1">
            <Button size="sm" variant="ghost" className={cn("h-6 px-2", MICRO)} onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="default"
              className={cn("h-6 px-2", MICRO)}
              disabled={reject.isPending}
              onClick={() => reject.mutate()}
            >
              {rejectLabel}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function InteractionFormPopover({
  item,
  issueId,
  interactionId,
  label,
  onActed,
}: {
  item: AttentionItem;
  issueId: string;
  interactionId: string;
  label: string;
  onActed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const interactions = useQuery({
    queryKey: ["plica", "interactions", issueId],
    queryFn: () => issuesApi.listInteractions(issueId),
    enabled: open,
    staleTime: 10_000,
  });
  const interaction = interactions.data?.find((entry) => entry.id === interactionId);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="default" className={cn("h-6 px-2 font-medium", MICRO)} aria-label={label}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] max-w-[90vw] p-3">
        {interactions.isLoading && (
          <p className={cn("flex items-center gap-2 text-muted-foreground", MICRO)}>
            <Loader2 className="h-3 w-3 animate-spin" /> loading…
          </p>
        )}
        {interactions.isError && (
          <p className={cn("text-red-600 dark:text-red-400", MICRO)}>Could not load: {errorMessage(interactions.error)}</p>
        )}
        {interactions.isSuccess && !interaction && (
          <p className={cn("text-muted-foreground", MICRO)}>This request is no longer pending.</p>
        )}
        {interaction && interaction.status !== "pending" && (
          <p className={cn("text-muted-foreground", MICRO)}>Already {interaction.status}.</p>
        )}
        {interaction?.status === "pending" && interaction.kind === "ask_user_questions" && (
          <QuestionsForm
            interaction={interaction}
            issueId={issueId}
            onDone={() => {
              setOpen(false);
              onActed();
            }}
          />
        )}
        {interaction?.status === "pending" && interaction.kind === "request_checkbox_confirmation" && (
          <CheckboxForm
            interaction={interaction}
            item={item}
            issueId={issueId}
            onDone={() => {
              setOpen(false);
              onActed();
            }}
          />
        )}
        {interaction?.status === "pending" &&
          interaction.kind !== "ask_user_questions" &&
          interaction.kind !== "request_checkbox_confirmation" && (
            <p className={cn("text-muted-foreground", MICRO)}>Open the thread to resolve this one.</p>
          )}
      </PopoverContent>
    </Popover>
  );
}

type Answer = { optionIds: string[]; otherText: string };

function QuestionsForm({
  interaction,
  issueId,
  onDone,
}: {
  interaction: AskUserQuestionsInteraction;
  issueId: string;
  onDone: () => void;
}) {
  const { pushToast } = useToastActions();
  const questions = interaction.payload.questions;
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [summary, setSummary] = useState("");
  const answerOf = (id: string): Answer => answers[id] ?? { optionIds: [], otherText: "" };
  const setAnswer = (id: string, next: Answer) => setAnswers((current) => ({ ...current, [id]: next }));

  const respond = useMutation({
    mutationFn: () =>
      issuesApi.respondInteraction(issueId, interaction.id, {
        answers: questions.map((question) => {
          const answer = answerOf(question.id);
          const freeTextSelected = question.options.some((option) => option.freeText && answer.optionIds.includes(option.id));
          return {
            questionId: question.id,
            optionIds: answer.optionIds,
            otherText: freeTextSelected || (answer.optionIds.length === 0 && answer.otherText.trim()) ? answer.otherText.trim() || null : null,
          };
        }),
        summaryMarkdown: summary.trim() || null,
      }),
    onSuccess: () => {
      pushToast({ title: "Answers sent", tone: "success" });
      onDone();
    },
    onError: (error) => pushToast({ title: "Could not send answers", body: errorMessage(error), tone: "error" }),
  });

  const incomplete = questions.some((question) => {
    if (question.required === false) return false;
    const answer = answerOf(question.id);
    return answer.optionIds.length === 0 && !answer.otherText.trim();
  });

  return (
    <form
      className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto"
      onSubmit={(event) => {
        event.preventDefault();
        respond.mutate();
      }}
    >
      {interaction.payload.title && <p className={cn("font-medium", BODY)}>{interaction.payload.title}</p>}
      {questions.map((question, index) => {
        const answer = answerOf(question.id);
        const multi = question.selectionMode === "multi";
        const freeTextOn = question.options.some((option) => option.freeText && answer.optionIds.includes(option.id));
        return (
          <fieldset key={question.id} className="flex flex-col gap-1.5">
            <legend className={cn("font-medium", BODY)}>
              {questions.length > 1 && <span className="text-muted-foreground">{index + 1}. </span>}
              {question.prompt}
            </legend>
            {question.helpText && <p className={cn("text-muted-foreground", MICRO)}>{question.helpText}</p>}
            {question.options.map((option) => {
              const checked = answer.optionIds.includes(option.id);
              return (
                <label key={option.id} className={cn("flex cursor-pointer items-start gap-2", BODY)}>
                  <input
                    type={multi ? "checkbox" : "radio"}
                    name={question.id}
                    value={option.id}
                    checked={checked}
                    onChange={() => {
                      const optionIds = multi
                        ? checked
                          ? answer.optionIds.filter((id) => id !== option.id)
                          : [...answer.optionIds, option.id]
                        : [option.id];
                      setAnswer(question.id, { ...answer, optionIds });
                    }}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    {option.label}
                    {option.description && <span className={cn("block text-muted-foreground", MICRO)}>{option.description}</span>}
                  </span>
                </label>
              );
            })}
            {(freeTextOn || question.options.length === 0) && (
              <Textarea
                value={answer.otherText}
                onChange={(event) => setAnswer(question.id, { ...answer, otherText: event.target.value })}
                placeholder="Your answer"
                rows={2}
                className={BODY}
              />
            )}
          </fieldset>
        );
      })}
      <Textarea
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder="Anything else? (optional)"
        rows={2}
        className={BODY}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="default" className={cn("h-7 px-3", MICRO)} disabled={incomplete || respond.isPending}>
          {respond.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {interaction.payload.submitLabel || "Send answers"}
        </Button>
      </div>
    </form>
  );
}

function CheckboxForm({
  interaction,
  item,
  issueId,
  onDone,
}: {
  interaction: RequestCheckboxConfirmationInteraction;
  item: AttentionItem;
  issueId: string;
  onDone: () => void;
}) {
  const { pushToast } = useToastActions();
  const payload = interaction.payload;
  const [selected, setSelected] = useState<string[]>(payload.defaultSelectedOptionIds ?? []);
  const accept = useMutation({
    mutationFn: () => issuesApi.acceptInteraction(issueId, interaction.id, { selectedOptionIds: selected }),
    onSuccess: () => {
      pushToast({ title: "Confirmed", tone: "success" });
      onDone();
    },
    onError: (error) => pushToast({ title: "Could not confirm", body: errorMessage(error), tone: "error" }),
  });
  const reject = useMutation({
    mutationFn: () => issuesApi.rejectInteraction(issueId, interaction.id),
    onSuccess: () => {
      pushToast({ title: "Declined", tone: "success" });
      onDone();
    },
    onError: (error) => pushToast({ title: "Could not decline", body: errorMessage(error), tone: "error" }),
  });
  const min = payload.minSelected ?? 0;
  const max = payload.maxSelected ?? null;
  const busy = accept.isPending || reject.isPending;
  return (
    <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
      <p className={cn("font-medium", BODY)}>{payload.prompt}</p>
      {payload.options.map((option) => {
        const checked = selected.includes(option.id);
        return (
          <label key={option.id} className={cn("flex cursor-pointer items-start gap-2", BODY)}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => setSelected((current) => (checked ? current.filter((id) => id !== option.id) : [...current, option.id]))}
              className="mt-1"
            />
            <span className="min-w-0">
              {option.label}
              {option.description && <span className={cn("block text-muted-foreground", MICRO)}>{option.description}</span>}
            </span>
          </label>
        );
      })}
      <div className="mt-1 flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-6 px-2 text-red-600 dark:text-red-400", MICRO)}
          disabled={busy}
          onClick={() => reject.mutate()}
        >
          {payload.rejectLabel || verbLabel(item, "reject", "Decline")}
        </Button>
        <Button
          size="sm"
          variant="default"
          className={cn("h-6 px-2", MICRO)}
          disabled={busy || selected.length < min || (max !== null && selected.length > max)}
          onClick={() => accept.mutate()}
        >
          {accept.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {payload.acceptLabel || verbLabel(item, "accept", "Confirm")}
        </Button>
      </div>
    </div>
  );
}

export type { IssueThreadInteraction };
