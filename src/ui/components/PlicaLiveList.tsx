import type { Company } from "@paperclipai/shared";
import { Loader2 } from "lucide-react";
import { CompanyPatternIcon } from "../host/ui-kit";
import type { PlicaLiveEntry } from "../lib/queue";
import { PlicaIssueHover } from "./PlicaIssueHover";
import { PlicaLink } from "./PlicaLink";
import { LiveDot, elapsedLabel, runNarration } from "./PlicaRunsStrip";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

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
 * Every agent at work right now, across companies, longest-running first —
 * the "what are they saying" half of the board, which the ledger's counts
 * deliberately leave out.
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
            const narration = runNarration(run, issue);
            const line = (
              <span className="block min-w-0 truncate text-muted-foreground">{narration}</span>
            );
            return (
              <li key={run.id} className="flex items-center gap-2.5 py-0.5 text-[length:var(--plica-fs-body,14px)] leading-[1.45]">
                <Avatar company={company} />
                {run.status === "running" ? (
                  <LiveDot />
                ) : (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
                )}
                <span className="w-44 shrink-0 truncate font-medium [.plica-kiosk_&]:w-60" title={`${run.agentName} · ${company.name}`}>
                  {run.agentName}
                </span>
                <span className="min-w-0 flex-1">
                  {run.issueId ? (
                    <PlicaIssueHover issueId={run.issueId} anchorClassName="block min-w-0">
                      <PlicaLink
                        to={`/${company.issuePrefix}/issues/${issue?.identifier ?? run.issueId}`}
                        companyId={company.id}
                        className="block hover:underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
                      >
                        {line}
                      </PlicaLink>
                    </PlicaIssueHover>
                  ) : (
                    line
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
