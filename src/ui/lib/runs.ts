import type { Issue } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../host/api";

export function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

export function elapsedLabel(run: LiveRunForIssue, nowMs = Date.now()): string {
  const started = run.startedAt ?? run.createdAt;
  const minutes = Math.max(0, Math.round((nowMs - new Date(started).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * A run's live narration, most human first: what the agent last said, then
 * its status line, then its planned next step, then the ticket title.
 */
export function runNarration(run: LiveRunForIssue, issue: Issue | undefined): string {
  return (
    run.lastAssistantSnippet?.trim() ||
    run.currentStatusMessage?.trim() ||
    run.nextAction?.trim() ||
    issue?.title ||
    run.triggerDetail ||
    run.invocationSource
  );
}
