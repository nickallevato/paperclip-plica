import { useCallback, useState } from "react";
import { decisionTriageApi, type DecisionTriageUpdate } from "../host/api";
import { useToastActions } from "../host/shims";
import type { PlicaQueueItem } from "../lib/queue";

/** A local, not-yet-confirmed change to one queue item. */
export type PlicaTriageOverride = DecisionTriageUpdate & { archived?: boolean };

export type PlicaTriageAction = DecisionTriageUpdate | { archive: true };

/**
 * Decide-by, snooze and archive for queue items, applied optimistically.
 *
 * The write goes to Paperclip's decision triage (the same rows its Decisions
 * page uses); the queue is rebuilt from the attention feed, which only
 * reflects the change on the next refetch. Until that lands, an override
 * holds the new value so a row moves lanes the moment it is clicked instead of
 * a poll later. The override is dropped once the refetch resolves — success or
 * not — so the server is always the last word, and a failed write puts the row
 * back and says why.
 */
export function useQueueTriage(refetch: (companyId: string) => Promise<void> | undefined) {
  const { pushToast } = useToastActions();
  const [overrides, setOverrides] = useState<Record<string, PlicaTriageOverride>>({});
  const [busy, setBusy] = useState<Record<string, true>>({});

  const drop = (id: string) => {
    setOverrides(({ [id]: _gone, ...rest }) => rest);
    setBusy(({ [id]: _gone, ...rest }) => rest);
  };

  const triage = useCallback(
    async (item: PlicaQueueItem, action: PlicaTriageAction) => {
      if (!item.triage) return;
      const { sourceKind, sourceId } = item.triage;
      const override: PlicaTriageOverride = "archive" in action ? { archived: true } : action;
      setOverrides((current) => ({ ...current, [item.id]: { ...current[item.id], ...override } }));
      setBusy((current) => ({ ...current, [item.id]: true }));
      try {
        if ("archive" in action) await decisionTriageApi.archive(item.companyId, sourceKind, sourceId);
        else await decisionTriageApi.update(item.companyId, sourceKind, sourceId, action);
        await refetch(item.companyId);
      } catch (error) {
        pushToast({
          title: "archive" in action ? "Could not archive" : action.snoozedUntil !== undefined ? "Could not snooze" : "Could not set when to decide",
          body: error instanceof Error ? error.message : "Please try again.",
          tone: "error",
        });
      } finally {
        drop(item.id);
      }
    },
    // `drop` only touches state setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pushToast, refetch],
  );

  return { overrides, busy, triage };
}

/** The queue as it will look once pending triage writes land. */
export function applyTriageOverrides(
  items: ReadonlyArray<PlicaQueueItem>,
  overrides: Record<string, PlicaTriageOverride>,
): PlicaQueueItem[] {
  if (Object.keys(overrides).length === 0) return items as PlicaQueueItem[];
  const out: PlicaQueueItem[] = [];
  for (const item of items) {
    const override = overrides[item.id];
    if (!override) {
      out.push(item);
      continue;
    }
    if (override.archived) continue;
    out.push({
      ...item,
      decideBy: override.decideBy !== undefined ? override.decideBy : item.decideBy,
      snoozedUntil: override.snoozedUntil !== undefined ? override.snoozedUntil : item.snoozedUntil,
    });
  }
  return out;
}
