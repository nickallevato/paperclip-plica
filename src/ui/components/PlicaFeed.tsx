import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { AttentionFeed, Company } from "@paperclipai/shared";
import { attentionApi } from "../host/api";
import { cn, queryKeys, toCompanyRelativePath } from "../host/util";
import { CompanyPatternIcon } from "../host/ui-kit";
import {
  attentionAgeMinutes,
  attentionDetailText,
  filterFeed,
  formatAgeMinutes,
  mergeAttentionFeed,
  plicaRefetchInterval,
  type PlicaFeedFilter,
} from "../lib/plica";
import { PlicaIssueHover } from "./PlicaIssueHover";
import { PlicaKindGlyph } from "./PlicaKindGlyph";
import { PlicaLink } from "./PlicaLink";

const FILTERS: Array<{ filter: PlicaFeedFilter; label: string }> = [
  { filter: "all", label: "Everything" },
  { filter: "unseen", label: "New since you looked" },
  { filter: "urgent", label: "Critical & high" },
];

/**
 * Every company's attention merged into one stream, newest first.
 *
 * The only view that is not one-company-per-element. Cross-company ordering is
 * the whole point: a fresh blocker at one company outranks a stale one at
 * another, which a wall of panes cannot express because each pane only sorts
 * against itself.
 *
 * Reads the same per-company attention queries the panes use, so switching
 * into this view costs nothing when those panes were already mounted — React
 * Query serves the shared keys.
 */
export function PlicaFeed({ companies, since }: { companies: Company[]; since: string | null }) {
  const [filter, setFilter] = useState<PlicaFeedFilter>("all");

  const results = useQueries({
    queries: companies.map((company) => ({
      queryKey: queryKeys.plica.attention(company.id),
      queryFn: () => attentionApi.list(company.id),
      refetchInterval: plicaRefetchInterval,
      refetchIntervalInBackground: true,
    })),
  });

  const loading = results.some((result) => result.isLoading);
  const rows = mergeAttentionFeed(
    companies.map((company, index) => ({
      company,
      items: (results[index]?.data as AttentionFeed | undefined)?.items,
    })),
  );
  const sinceMs = since ? new Date(since).getTime() : null;
  const shown = filterFeed(rows, filter, sinceMs);
  const nowMs = Date.now();
  const fresh = sinceMs === null ? 0 : filterFeed(rows, "unseen", sinceMs).length;
  const urgent = filterFeed(rows, "urgent", sinceMs).length;

  // Only meaningful in the unfiltered stream, where the rule separates what
  // arrived since your last visit from what was already there.
  let ruleDrawn = false;

  return (
    <div data-view="feed" className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold uppercase tracking-wide text-muted-foreground">
          All companies
        </span>
        <div role="group" aria-label="Feed filter" className="flex items-center rounded-md border p-0.5">
          {FILTERS.map(({ filter: value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45]",
                filter === value ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[length:var(--plica-fs-micro,11px)] leading-[1.45] tabular-nums text-muted-foreground">
          {rows.length} open · {fresh} new · {urgent} critical or high
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <p className="px-3 py-4 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-muted-foreground">
          Loading…
        </p>
      ) : shown.length === 0 ? (
        <p className="px-3 py-4 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
          Nothing matches this filter.
        </p>
      ) : (
        <ul className="max-h-[70vh] overflow-y-auto p-1">
          {shown.map(({ company, item }) => {
            const subject = item.subject;
            const href = subject.href ? `/${company.issuePrefix}${toCompanyRelativePath(subject.href)}` : null;
            const activityMs = item.activityAt ? new Date(item.activityAt).getTime() : null;
            const drawRule =
              filter === "all" && !ruleDrawn && sinceMs !== null && (activityMs === null || activityMs <= sinceMs);
            if (drawRule) ruleDrawn = true;

            const row = (
              <div
                title={attentionDetailText(item.detail) ?? item.whyNow}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40",
                  item.severity === "critical" && "bg-red-500/10",
                )}
              >
                <CompanyPatternIcon
                  companyName={company.name}
                  logoUrl={company.logoUrl}
                  brandColor={company.brandColor}
                  className="size-4 shrink-0 rounded text-[7px]"
                />
                <span className="w-28 shrink-0 truncate text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
                  {company.name}
                </span>
                <PlicaKindGlyph
                  kind={item.sourceKind}
                  className={
                    item.severity === "critical"
                      ? "text-red-600 dark:text-red-400"
                      : item.severity === "high"
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-muted-foreground"
                  }
                />
                {subject.identifier && (
                  <span className="w-14 shrink-0 truncate font-mono text-[length:var(--plica-fs-micro,11px)] leading-[1.45] tabular-nums text-muted-foreground">
                    {subject.identifier}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{subject.title ?? item.whyNow}</span>
                <span className="shrink-0 tabular-nums text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
                  {formatAgeMinutes(attentionAgeMinutes(item, nowMs))}
                </span>
              </div>
            );

            return (
              <li key={`${company.id}-${item.id}`} className="text-[length:var(--plica-fs-body,14px)] leading-[1.45]">
                {drawRule && (
                  <div
                    data-feed-rule
                    className="flex items-center gap-2 px-1.5 pb-1 pt-2 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold uppercase tracking-wide text-primary"
                  >
                    <span className="whitespace-nowrap">{fresh} new since you looked</span>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </div>
                )}
                {href ? (
                  subject.kind === "issue" ? (
                    <PlicaIssueHover issueId={subject.id} anchorClassName="block min-w-0">
                      <PlicaLink to={href} companyId={company.id} className="block">
                        {row}
                      </PlicaLink>
                    </PlicaIssueHover>
                  ) : (
                    <PlicaLink to={href} companyId={company.id} className="block">
                      {row}
                    </PlicaLink>
                  )
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
