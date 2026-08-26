import type { Company, Issue } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../host/api";
import { CompanyPatternIcon, HoverCard, HoverCardContent, HoverCardTrigger, IssueStatusBadge } from "../host/ui-kit";
import { cn } from "../host/util";
import type { PlicaLiveEntry } from "../lib/queue";
import { elapsedLabel, humanStatus, isStartingUp, runNarration, runPhase } from "../lib/runs";
import { LiveDot, QueuedDot } from "./LiveDot";
import { PlicaLink } from "./PlicaLink";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

/** Markdown emphasis/headings/code marks read as noise in a four-line excerpt. */
function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const BODY = "text-[length:var(--plica-fs-body,14px)] leading-[1.45]";

function Avatar({ company }: { company: Company }) {
  return (
    <CompanyPatternIcon
      companyName={company.name}
      logoUrl={company.logoUrl}
      brandColor={company.brandColor}
      className="size-5 shrink-0 rounded-md text-[8px]"
    />
  );
}

/**
 * The hover detail: the agent's own last words (the human-readable summary
 * the host shows in the thread), with the terse status line only as a
 * fallback. No tool names or runtime plumbing.
 */
function RunDetail({ run, issue, company }: { run: LiveRunForIssue; issue: Issue | undefined; company: Company }) {
  const queued = runPhase(run) === "queued";
  const summary = queued ? null : (humanStatus(run) ?? run.nextAction?.trim() ?? null);
  const startingUp = !summary && isStartingUp(run);
  return (
    <div className={cn("flex flex-col gap-2", BODY)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {issue?.identifier && <span className={cn("mr-1.5 font-mono text-muted-foreground", MICRO)}>{issue.identifier}</span>}
          <span className="font-medium">{issue?.title ?? run.triggerDetail ?? run.invocationSource}</span>
        </div>
        {issue?.status && <IssueStatusBadge status={issue.status} />}
      </div>
      {summary ? (
        <p className="whitespace-pre-line">{summary}</p>
      ) : (
        <>
          <p className="italic text-muted-foreground">
            {queued
              ? "queued — waiting for a runner, no agent on it yet"
              : startingUp
                ? "starting up — nothing to report yet"
                : "working — nothing reported yet"}
          </p>
          {issue?.description?.trim() && <p className="line-clamp-4 text-muted-foreground">{plainText(issue.description)}</p>}
        </>
      )}
      <p className={cn("text-muted-foreground", MICRO)}>
        {run.agentName} · {company.name} · {queued ? `queued ${elapsedLabel(run)}` : elapsedLabel(run)}
      </p>
    </div>
  );
}

/**
 * Every agent at work right now, across companies, longest-running first:
 * who, on which ticket. The agent's own narration of what it is doing and
 * what comes next sits behind a hover on the ticket.
 */
export function PlicaLiveList({ entries, limit = 8 }: { entries: PlicaLiveEntry[]; limit?: number }) {
  const visible = entries.slice(0, limit);
  const overflow = entries.length - visible.length;
  const working = entries.filter((entry) => entry.phase === "working").length;
  const queued = entries.length - working;
  return (
    <section data-plica-live className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3">
      <h3 className={`flex items-center gap-2 ${MICRO} font-semibold uppercase tracking-wide text-muted-foreground`}>
        <LiveDot />
        Live now
        <span className="tabular-nums">· {working} working</span>
        {queued > 0 && (
          <span className="flex items-center gap-1 tabular-nums font-normal normal-case">
            <QueuedDot />
            {queued} queued
          </span>
        )}
      </h3>
      {visible.length === 0 ? (
        <p className={`${MICRO} italic text-muted-foreground`}>idle — no agents running anywhere</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map(({ company, run, issue, phase }) => {
            const queuedRun = phase === "queued";
            const label = issue ? issue.title : runNarration(run, issue);
            const line = (
              <span className="flex min-w-0 items-baseline gap-1.5">
                {issue?.identifier && <span className={cn("shrink-0 font-mono text-muted-foreground", MICRO)}>{issue.identifier}</span>}
                <span className="min-w-0 truncate">{label}</span>
              </span>
            );
            const ticket = run.issueId ? (
              <HoverCard>
                <HoverCardTrigger asChild>
                  <span className="block min-w-0">
                    <PlicaLink
                      to={`/${company.issuePrefix}/issues/${issue?.identifier ?? run.issueId}`}
                      companyId={company.id}
                      className="block font-medium hover:underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
                    >
                      {line}
                    </PlicaLink>
                  </span>
                </HoverCardTrigger>
                <HoverCardContent data-live-detail>
                  <RunDetail run={run} issue={issue} company={company} />
                </HoverCardContent>
              </HoverCard>
            ) : (
              <span className="block min-w-0 truncate text-muted-foreground">{label}</span>
            );
            return (
              <li
                key={run.id}
                data-run-phase={phase}
                className={cn("flex items-start gap-2.5 py-0.5", BODY, queuedRun && "opacity-70")}
              >
                <Avatar company={company} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {ticket}
                  <span className={cn("flex items-center gap-1.5 text-muted-foreground", MICRO)}>
                    {queuedRun ? <QueuedDot /> : <LiveDot />}
                    <span className="min-w-0 truncate" title={`${run.agentName} · ${company.name}`}>
                      {run.agentName}
                    </span>
                    {queuedRun && <span className="shrink-0 uppercase tracking-wide">queued</span>}
                    <span
                      className="ml-auto shrink-0 tabular-nums"
                      title={queuedRun ? `queued for ${elapsedLabel(run)}` : `running for ${elapsedLabel(run)}`}
                    >
                      {elapsedLabel(run)}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
          {overflow > 0 && (
            <li className={`${MICRO} text-muted-foreground`}>+{overflow} more run{overflow === 1 ? "" : "s"}</li>
          )}
        </ul>
      )}
    </section>
  );
}
