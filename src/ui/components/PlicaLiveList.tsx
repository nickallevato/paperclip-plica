import type { Company, Issue } from "@paperclipai/shared";
import { Loader2 } from "lucide-react";
import type { LiveRunForIssue } from "../host/api";
import { CompanyPatternIcon, HoverCard, HoverCardContent, HoverCardTrigger, IssueStatusBadge } from "../host/ui-kit";
import { cn } from "../host/util";
import type { PlicaLiveEntry } from "../lib/queue";
import { elapsedLabel, runNarration } from "../lib/runs";
import { LiveDot } from "./LiveDot";
import { PlicaLink } from "./PlicaLink";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";
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
  const said = run.lastAssistantSnippet?.trim() || null;
  const status = run.currentStatusMessage?.trim() || null;
  const next = run.nextAction?.trim() || null;
  const summary = said ?? status ?? next;
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
      ) : issue?.description?.trim() ? (
        <p className="line-clamp-4 text-muted-foreground">{issue.description.trim()}</p>
      ) : (
        <p className="italic text-muted-foreground">working — nothing reported yet</p>
      )}
      <p className={cn("text-muted-foreground", MICRO)}>
        {run.agentName} · {company.name} · {elapsedLabel(run)}
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
  return (
    <section data-plica-live className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3">
      <h3 className={`flex items-center gap-2 ${MICRO} font-semibold uppercase tracking-wide text-muted-foreground`}>
        <LiveDot />
        Live now
        <span className="tabular-nums">· {entries.length} run{entries.length === 1 ? "" : "s"}</span>
      </h3>
      {visible.length === 0 ? (
        <p className={`${MICRO} italic text-muted-foreground`}>idle — no agents running anywhere</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map(({ company, run, issue }) => {
            const label = issue ? issue.title : runNarration(run, issue);
            const line = (
              <span className="flex min-w-0 items-baseline gap-1.5">
                {issue?.identifier && <span className={cn("shrink-0 font-mono text-muted-foreground", MICRO)}>{issue.identifier}</span>}
                <span className="min-w-0 truncate">{label}</span>
              </span>
            );
            return (
              <li key={run.id} className={cn("flex items-center gap-2.5 py-0.5", BODY)}>
                <Avatar company={company} />
                {run.status === "running" ? (
                  <LiveDot />
                ) : (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
                )}
                <span className="max-w-[32%] shrink-0 truncate text-muted-foreground" title={`${run.agentName} · ${company.name}`}>
                  {run.agentName}
                </span>
                <span className="min-w-0 flex-1">
                  {run.issueId ? (
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
                  )}
                </span>
                <span className={`${MICRO} shrink-0 tabular-nums text-muted-foreground`} title={`running for ${elapsedLabel(run)}`}>
                  {elapsedLabel(run)}
                </span>
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
