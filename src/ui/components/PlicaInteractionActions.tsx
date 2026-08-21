import { useEffect, useRef, useState } from "react";
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

/**
 * Drafts survive closing the popover or the tab, the way the host's comment
 * composers do: localStorage, debounced, cleared on send. Keyed per
 * interaction, so a half-answered question set comes back as you left it.
 */
export const PLICA_DRAFT_DEBOUNCE_MS = 800;
export const draftKeyFor = (interactionId: string) => `plica.interactionDraft.${interactionId}`;

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown, empty: boolean) {
  try {
    if (empty) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage disabled or full — drafts are a convenience, never an error
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Debounced write of `value` under `key`; skips the initial mount so loading a draft never re-saves it. */
function useDraftSaver(key: string, value: unknown, empty: boolean) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => saveDraft(key, value, empty), PLICA_DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, value, empty]);
}

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
        variant="outline"
        className={cn("h-6 whitespace-nowrap px-2 font-medium", MICRO)}
        disabled={busy}
        aria-label={acceptLabel}
        onClick={() => accept.mutate()}
      >
        {accept.isPending ? (
          <Loader2 className="mr-1 h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <Check className="mr-1 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        {acceptLabel}
      </Button>
      <Popover open={declineOpen} onOpenChange={setDeclineOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-6 whitespace-nowrap px-2 text-muted-foreground hover:text-red-600 dark:hover:text-red-400", MICRO)}
            disabled={busy}
            aria-label={rejectLabel}
          >
            <X className="mr-1 h-3 w-3 shrink-0" /> {rejectLabel}
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
        <Button size="sm" variant="outline" className={cn("h-6 px-2 font-medium", MICRO)} aria-label={label}>
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
  const draftKey = draftKeyFor(interaction.id);
  const [draft] = useState(() => loadDraft<{ answers?: Record<string, Answer>; summary?: string }>(draftKey));
  const [answers, setAnswers] = useState<Record<string, Answer>>(draft?.answers ?? {});
  const [summary, setSummary] = useState(draft?.summary ?? "");
  const answerOf = (id: string): Answer => answers[id] ?? { optionIds: [], otherText: "" };
  const untouched =
    !summary.trim() && Object.values(answers).every((answer) => answer.optionIds.length === 0 && !answer.otherText.trim());
  useDraftSaver(draftKey, { answers, summary }, untouched);
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
      clearDraft(draftKey);
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
      {(interaction.payload.title || draft) && (
        <div className="flex items-baseline gap-2">
          {interaction.payload.title && <p className={cn("font-semibold", BODY)}>{interaction.payload.title}</p>}
          {draft && <span className={cn("ml-auto shrink-0 italic text-muted-foreground", MICRO)}>draft restored</span>}
        </div>
      )}
      {questions.map((question, index) => {
        const answer = answerOf(question.id);
        const multi = question.selectionMode === "multi";
        const freeTextOn = question.options.some((option) => option.freeText && answer.optionIds.includes(option.id));
        const answered = answer.optionIds.length > 0 || !!answer.otherText.trim();
        return (
          <fieldset
            key={question.id}
            data-question={question.id}
            className={cn(
              "flex flex-col gap-2 rounded-md border p-2.5",
              answered ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "bg-muted/30",
            )}
          >
            <legend className="sr-only">{question.prompt}</legend>
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full font-semibold tabular-nums",
                  MICRO,
                  answered ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {answered ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className={cn("font-medium", BODY)}>
                  {question.prompt}
                  {question.required === false && <span className={cn("ml-1 font-normal text-muted-foreground", MICRO)}>optional</span>}
                </p>
                {question.helpText && <p className={cn("text-muted-foreground", MICRO)}>{question.helpText}</p>}
                {multi && question.options.length > 0 && <p className={cn("text-muted-foreground", MICRO)}>select all that apply</p>}
              </div>
            </div>
            <div className="ml-7 flex flex-col gap-1">
            {question.options.map((option) => {
              const checked = answer.optionIds.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-muted/60",
                    BODY,
                    checked && "bg-muted/80",
                  )}
                >
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
                className={cn("mt-1", BODY)}
              />
            )}
            </div>
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
      <div className="flex items-center justify-end gap-2">
        <span className={cn("mr-auto text-muted-foreground", MICRO)}>
          {questions.filter((question) => {
            const answer = answerOf(question.id);
            return answer.optionIds.length > 0 || !!answer.otherText.trim();
          }).length}
          /{questions.length} answered · draft saved as you type
        </span>
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
  const draftKey = draftKeyFor(interaction.id);
  const [selected, setSelected] = useState<string[]>(
    () => loadDraft<{ selected: string[] }>(draftKey)?.selected ?? payload.defaultSelectedOptionIds ?? [],
  );
  useDraftSaver(draftKey, { selected }, selected.length === 0);
  const accept = useMutation({
    mutationFn: () => issuesApi.acceptInteraction(issueId, interaction.id, { selectedOptionIds: selected }),
    onSuccess: () => {
      clearDraft(draftKey);
      pushToast({ title: "Confirmed", tone: "success" });
      onDone();
    },
    onError: (error) => pushToast({ title: "Could not confirm", body: errorMessage(error), tone: "error" }),
  });
  const reject = useMutation({
    mutationFn: () => issuesApi.rejectInteraction(issueId, interaction.id),
    onSuccess: () => {
      clearDraft(draftKey);
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
          <label key={option.id} className={cn("flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-muted/60", BODY, checked && "bg-muted/80")}>
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

/**
 * The ask as its own block under the headline. The feed carries only a
 * server-truncated excerpt, so for thread interactions expanding the block
 * fetches the payload and shows the whole prompt — or every question — in
 * place; for anything else it just unclamps.
 */
export function PlicaAskBlock({ item, text }: { item: AttentionItem; text: string }) {
  const [open, setOpen] = useState(false);
  const issueId = attentionIssueId(item);
  const fetchable = item.subject.kind === "interaction" && issueId !== null;
  const expandable = fetchable || text.length > 120;
  const interactions = useQuery({
    queryKey: ["plica", "interactions", issueId],
    queryFn: () => issuesApi.listInteractions(issueId as string),
    enabled: open && fetchable,
    staleTime: 10_000,
  });
  const interaction = interactions.data?.find((entry) => entry.id === item.subject.id);
  const full = interaction ? fullPrompt(interaction) : null;
  const lead = item.originAgentName;
  return (
    <div
      data-queue-ask
      data-expanded={open}
      className={cn("text-muted-foreground", BODY, expandable && "cursor-pointer")}
      onClick={expandable ? () => setOpen((current) => !current) : undefined}
      title={expandable && !open ? "Click to read the whole prompt" : undefined}
    >
      {open && full ? (
        <div className="flex flex-col gap-1 whitespace-pre-wrap">
          {lead && <span className="font-medium text-foreground/80">{lead}</span>}
          {full.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      ) : (
        <p className={cn(!open && "line-clamp-2")}>
          {lead && <span className="font-medium text-foreground/80">{lead} · </span>}
          {text}
          {open && interactions.isLoading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
          {!open && expandable && <span className="ml-1 text-muted-foreground/70">more</span>}
        </p>
      )}
    </div>
  );
}

/** The payload's own words, one paragraph per line: prompt + details, or the questions in order. */
function fullPrompt(interaction: IssueThreadInteraction): string[] | null {
  switch (interaction.kind) {
    case "request_confirmation":
    case "request_checkbox_confirmation": {
      const lines = [interaction.payload.prompt];
      if (interaction.payload.detailsMarkdown?.trim()) lines.push(interaction.payload.detailsMarkdown.trim());
      return lines;
    }
    case "ask_user_questions": {
      const { title, questions } = interaction.payload;
      const lines = questions.map((question, index) => `${questions.length > 1 ? `${index + 1}. ` : ""}${question.prompt}`);
      return title ? [title, ...lines] : lines;
    }
    default:
      return null;
  }
}
