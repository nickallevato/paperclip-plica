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
 * Runtime plumbing masquerading as a status line — "startup step:
 * acp.handshake (1788ms)", "git_sync: fetching", "phase: restore" — is for
 * the run log, not a person. Anything shaped like `key: machine.token` or
 * carrying a millisecond timing is treated as not-human.
 */
export function isRuntimeStatus(message: string): boolean {
  const text = message.trim();
  if (!text) return true;
  if (/\(\d+\s*ms\)/i.test(text)) return true;
  if (/^(startup|git[_ ]sync|config[_ ]sync|adapter|restore|export|finalize|phase|step|sandbox|acp)\b[^:]*:/i.test(text)) return true;
  if (/^[a-z][\w-]*(\s[a-z][\w-]*)?:\s*[a-z][\w-]*(\.[\w-]+)+/i.test(text)) return true;
  return false;
}

/** The agent's status line, only when a person would want to read it. */
export function humanStatus(run: LiveRunForIssue): string | null {
  const said = run.lastAssistantSnippet?.trim();
  if (said) return said;
  const status = run.currentStatusMessage?.trim();
  if (status && !isRuntimeStatus(status)) return status;
  return null;
}

/** True while the run has only reported runtime setup so far. */
export function isStartingUp(run: LiveRunForIssue): boolean {
  return !run.lastAssistantSnippet?.trim() && !!run.currentStatusMessage?.trim() && isRuntimeStatus(run.currentStatusMessage);
}

/**
 * A run's live narration, most human first: what the agent last said, then
 * a readable status line, then its planned next step, then the ticket title.
 */
export function runNarration(run: LiveRunForIssue, issue: Issue | undefined): string {
  return (
    humanStatus(run) ||
    run.nextAction?.trim() ||
    issue?.title ||
    run.triggerDetail ||
    run.invocationSource
  );
}
