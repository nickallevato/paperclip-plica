import { useQueries } from "@tanstack/react-query";
import { ChevronDown, X } from "lucide-react";
import type { Company } from "@paperclipai/shared";
import { issuesApi } from "../host/api";
import { workTimelineApi } from "../host/api";
import { Button } from "../host/ui-kit";
import { deriveBriefingLine, relativeTimeLabel } from "../lib/plica";
import { queryKeys } from "../host/util";
import { cn } from "../host/util";

interface PlicaBriefingProps {
  companies: Company[];
  since: string;
  onDismiss: () => void;
}

/**
 * "Since you last looked" strip (spec §7): two one-shot per-company
 * batches — `workTimelineApi.get(companyId, { from: since })` (failed-run
 * counts) and `issuesApi.list(companyId, { status: "done,blocked" })`
 * (done/blocked counts, filtered further by `updatedAt` in
 * `deriveBriefingLine` — see its doc comment for why issues rather than
 * timeline events drive those two counts). Both summarized via the pure
 * `deriveBriefingLine` helper into a "N done · N new blockers · N failed
 * runs" line. `staleTime: Infinity` + `refetchInterval: false` keep this a
 * one-shot batch — it never re-polls like the rest of the HUD.
 */
export function PlicaBriefing({ companies, since, onDismiss }: PlicaBriefingProps) {
  const timelineQueries = useQueries({
    queries: companies.map((company) => ({
      queryKey: queryKeys.plica.timeline(company.id),
      queryFn: () => workTimelineApi.get(company.id, { from: since, limit: 200 }),
      staleTime: Infinity,
      refetchInterval: false as const,
    })),
  });
  const briefingIssuesQueries = useQueries({
    queries: companies.map((company) => ({
      queryKey: queryKeys.plica.briefingIssues(company.id),
      queryFn: () => issuesApi.list(company.id, { status: "done,blocked", limit: 200 }),
      staleTime: Infinity,
      refetchInterval: false as const,
    })),
  });

  const isLoading =
    timelineQueries.some((query) => query.isLoading) || briefingIssuesQueries.some((query) => query.isLoading);

  const lines = companies
    .map((company, index) => {
      const timelineResult = timelineQueries[index]?.data;
      const issues = briefingIssuesQueries[index]?.data;
      if (!timelineResult || !issues) return null;
      const counts = deriveBriefingLine({ issues, timelineEntries: timelineResult, sinceIso: since });
      const parts: string[] = [];
      if (counts.done > 0) parts.push(`${counts.done} done`);
      if (counts.blockers > 0) parts.push(`${counts.blockers} new blocker${counts.blockers === 1 ? "" : "s"}`);
      if (counts.failedRuns > 0) parts.push(`${counts.failedRuns} failed run${counts.failedRuns === 1 ? "" : "s"}`);
      if (parts.length === 0) return null;
      return { company, text: parts.join(" · ") };
    })
    .filter((line): line is { company: Company; text: string } => line !== null);

  const relative = relativeTimeLabel(since, Date.now());

  return (
    <div
      data-testid="plica-briefing"
      className={cn("flex flex-col gap-1.5 rounded-md border bg-muted/30 px-3 py-2 text-sm")}
    >
      <div className="flex items-center gap-2">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">Since you last looked ({relative})</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-[length:var(--plica-fs-body,0.75rem)] text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="mr-1 h-3 w-3" /> Dismiss
        </Button>
      </div>
      {isLoading ? (
        <p className="text-[length:var(--plica-fs-body,0.75rem)] text-muted-foreground">Compiling briefing…</p>
      ) : lines.length === 0 ? (
        <p className="text-[length:var(--plica-fs-body,0.75rem)] text-muted-foreground">All quiet since {relative}.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {lines.map(({ company, text }) => (
            <li key={company.id} className="text-[length:var(--plica-fs-body,0.75rem)] text-muted-foreground">
              <span className="font-medium text-foreground">{company.name}:</span> {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
