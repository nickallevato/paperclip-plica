import type { Company, Issue } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../host/api";
import { CompanyPatternIcon, HoverCard, HoverCardContent, HoverCardTrigger, IssueStatusBadge } from "../host/ui-kit";
import { cn } from "../host/util";
import type { PlicaLiveEntry } from "../lib/queue";
import { elapsedLabel, humanStatus, isStartingUp, runNarration, runPhase } from "../lib/runs";
import { LiveDot, QueuedDot } from "./LiveDot";
import { PlicaLink } from "./PlicaLink";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";
const BODY = "text-[length:var(--plica-fs-body,14px)] leading-[1.45]";

/** Markdown emphasis/headings/code marks read as noise in a four-line excerpt. */
function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The hover detail: the agent's own last words (the human-readable summary
 * the host shows in the thread), with the terse status line only as a
 * fallback. No tool names or runtime plumbing.
 *
 * This carries more weight in the strip than it did in the rail: a pill has
 * room for an identifier and an elapsed time and nothing else, so the hover is
 * now the only place the narration lives.
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
 * One run as a pill: whose it is, which ticket, how long it has been going.
 *
 * Deliberately fixed-content: no narration, no status line, nothing that can
 * grow a second line and change the strip's height. Everything the old rail
 * row carried below the title now lives in the hover.
 */
function RunPill({ company, run, issue, phase }: PlicaLiveEntry) {
  const queued = phase === "queued";
  const label = issue?.identifier ?? runNarration(run, issue);
  const body = (
    <span
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1",
        MICRO,
        queued ? "border-dashed opacity-70" : "hover:bg-muted/50",
      )}
    >
      <CompanyPatternIcon
        companyName={company.name}
        logoUrl={company.logoUrl}
        brandColor={company.brandColor}
        className="size-4 shrink-0 rounded text-[7px]"
      />
      {queued ? <QueuedDot /> : <LiveDot />}
      <span className="font-mono font-medium text-foreground">{label}</span>
      <span className="max-w-28 truncate text-muted-foreground">{run.agentName}</span>
      <span className="tabular-nums text-muted-foreground">{elapsedLabel(run)}</span>
    </span>
  );
  return (
    <li data-run-phase={phase} className="shrink-0">
      <HoverCard>
        {/* The trigger's child is a plain span, not the link: `asChild` clones
            its child with a ref and a data-slot, and PlicaLink accepts a fixed
            prop set that would silently drop both. */}
        <HoverCardTrigger asChild>
          <span className="block">
            {run.issueId ? (
              <PlicaLink
                to={`/${company.issuePrefix}/issues/${issue?.identifier ?? run.issueId}`}
                companyId={company.id}
                className="block"
                title={`${run.agentName} · ${company.name}`}
              >
                {body}
              </PlicaLink>
            ) : (
              body
            )}
          </span>
        </HoverCardTrigger>
        <HoverCardContent data-live-detail>
          <RunDetail run={run} issue={issue} company={company} />
        </HoverCardContent>
      </HoverCard>
    </li>
  );
}

/**
 * Live now, as one row across the top of the board.
 *
 * It was a rail pane, where it was the worst possible neighbour: its height
 * tracked the size of the fleet, so every run that started or finished shoved
 * Portfolio and Routines down the page. Boxing it into a fixed share of a
 * sticky column fixed the shoving but cost the rail the height Routines
 * needed to stay on screen at all.
 *
 * A single row solves both at once. The strip's height cannot change — one
 * line of pills, overflow going sideways — so nothing below it ever moves, and
 * the rail below gets its full height back for the two lists that actually
 * want vertical room. Running agents are also a glance, not a list you work
 * through, which is exactly what a ticker is for.
 */
export function PlicaLiveStrip({ entries }: { entries: PlicaLiveEntry[] }) {
  const working = entries.filter((entry) => entry.phase === "working").length;
  const queued = entries.length - working;
  return (
    <section
      data-plica-live
      className="flex items-center gap-3 overflow-hidden rounded-lg border bg-card px-3 py-2"
    >
      <h3
        className={cn(
          "flex shrink-0 items-center gap-2 font-semibold uppercase tracking-wide text-muted-foreground",
          MICRO,
        )}
      >
        <LiveDot />
        Live now
        <span className="tabular-nums">· {working} working</span>
        {queued > 0 && (
          <span className="flex items-center gap-1 font-normal normal-case tabular-nums">
            <QueuedDot />
            {queued} queued
          </span>
        )}
      </h3>
      {entries.length === 0 ? (
        <p className={cn("italic text-muted-foreground", MICRO)}>idle — no agents running anywhere</p>
      ) : (
        // Nothing is capped: the row scrolls sideways instead, so the header
        // count and what you can reach always agree.
        <ul className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {entries.map((entry) => (
            <RunPill key={entry.run.id} {...entry} />
          ))}
        </ul>
      )}
    </section>
  );
}
