import { Loader2 } from "lucide-react";
import type { Company, Issue } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../host/api";
import { PlicaIssueHover } from "./PlicaIssueHover";
import { PlicaLink } from "./PlicaLink";
import { PlicaQuickActions } from "./PlicaQuickActions";

const MAX_VISIBLE = 3;

function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

function elapsedLabel(run: LiveRunForIssue): string {
  const started = run.startedAt ?? run.createdAt;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(started).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * A run's live narration: agents describe their current step in
 * currentStatusMessage / nextAction while running, so prefer that over the
 * static issue title — this is what makes the strip read as "live".
 */
function runNarration(run: LiveRunForIssue, issue: Issue | undefined): string {
  return (
    run.currentStatusMessage?.trim() ||
    run.nextAction?.trim() ||
    issue?.title ||
    run.triggerDetail ||
    run.invocationSource
  );
}

interface PlicaRunsStripProps {
  runs: LiveRunForIssue[];
  issues: Issue[];
  company: Company;
  onActed: () => void;
}

/** The app's canonical "live" indicator (matches the Agents page live-run
 * pill), with a slower halo — a wall of a dozen dots throbbing at full
 * tailwind-pulse speed drowns out the actual alert channel. */
function LiveDot() {
  return (
    <span data-live-dot className="relative flex h-2 w-2 shrink-0" aria-label="Agent live">
      <span className="absolute inline-flex h-full w-full animate-[pulse_3s_ease-in-out_infinite] rounded-full bg-blue-400 opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
    </span>
  );
}

export function PlicaRunsStrip({ runs, issues, company, onActed }: PlicaRunsStripProps) {
  const active = runs.filter(isRunActive);
  if (active.length === 0) {
    return <p className="text-[length:var(--plica-fs-micro,11px)] italic text-muted-foreground">idle — no agents running</p>;
  }
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const visible = active.slice(0, MAX_VISIBLE);
  const overflow = active.length - visible.length;
  return (
    <ul className="space-y-1">
      {visible.map((run) => {
        const issue = run.issueId ? issueById.get(run.issueId) : undefined;
        const narration = runNarration(run, issue);
        const narrationLine = (
          <span className="line-clamp-2 text-muted-foreground leading-snug">{narration}</span>
        );
        return (
          <li key={run.id} className="rounded-md border bg-muted/20 px-2 py-1 text-[length:var(--plica-fs-body,0.75rem)]">
            <span className="flex items-center gap-2">
              {run.status === "running" ? (
                <LiveDot />
              ) : (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{run.agentName}</span>
              <span
                className="shrink-0 tabular-nums text-muted-foreground"
                title={`running for ${elapsedLabel(run)}`}
              >
                {elapsedLabel(run)}
              </span>
              {run.issueId && (
                <PlicaQuickActions
                  issueId={run.issueId}
                  issueStatus={issue?.status}
                  onActed={onActed}
                />
              )}
            </span>
            {run.issueId ? (
              <PlicaIssueHover issueId={run.issueId} anchorClassName="mt-0.5 min-w-0 pl-4">
                <PlicaLink
                  to={`/${company.issuePrefix}/issues/${issue?.identifier ?? run.issueId}`}
                  companyId={company.id}
                  className="block hover:underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
                >
                  {narrationLine}
                </PlicaLink>
              </PlicaIssueHover>
            ) : (
              <span className="mt-0.5 block min-w-0 pl-4">{narrationLine}</span>
            )}
          </li>
        );
      })}
      {overflow > 0 && (
        <li>
          <PlicaLink
            to={`/${company.issuePrefix}/agents/all`}
            companyId={company.id}
            className="text-[length:var(--plica-fs-micro,11px)] text-muted-foreground hover:text-foreground"
          >
            +{overflow} more run{overflow === 1 ? "" : "s"} →
          </PlicaLink>
        </li>
      )}
    </ul>
  );
}
