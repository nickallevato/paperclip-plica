import type { AttentionItem, Company } from "@paperclipai/shared";
import { cn, toCompanyRelativePath } from "../host/util";
import { attentionAgeMinutes, attentionDetailText, formatAgeMinutes } from "../lib/plica";
import { PlicaIssueHover } from "./PlicaIssueHover";
import { PlicaKindGlyph } from "./PlicaKindGlyph";
import { PlicaLink } from "./PlicaLink";

/**
 * One attention item on exactly one line.
 *
 * The card renders the model's prose first at line-clamp-2, so its height
 * depends on what an agent happened to write and no two panes align. This
 * leads with the stable noun instead — identifier then subject title, both
 * truncated — and lets the prose be a hover. The result is a fixed row height,
 * which is what makes a wall of panes line up.
 *
 * Age sits in a fixed right rail with tabular figures so ages read as a column.
 */
export function PlicaAttentionLedgerRow({
  item,
  company,
  nowMs,
}: {
  item: AttentionItem;
  company: Company;
  nowMs: number;
}) {
  const subject = item.subject;
  const href = subject.href ? `/${company.issuePrefix}${toCompanyRelativePath(subject.href)}` : null;
  const age = formatAgeMinutes(attentionAgeMinutes(item, nowMs));
  // Prose is still the most useful thing on hover, so keep it as the title.
  const prose = attentionDetailText(item.detail) ?? item.whyNow;
  const title = subject.title ?? item.whyNow;

  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          "h-full w-0.5 shrink-0 self-stretch rounded-full",
          item.severity === "critical" ? "bg-red-500" : item.severity === "high" ? "bg-amber-500" : "bg-muted-foreground/30",
        )}
      />
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
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 tabular-nums text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-muted-foreground">
        {age}
      </span>
    </>
  );

  const row = (
    <div
      title={prose}
      className={cn(
        "flex w-full items-center gap-2 rounded px-1.5 py-1",
        item.severity === "critical" && "bg-red-500/10",
      )}
    >
      {inner}
    </div>
  );

  const content = href ? (
    <PlicaLink to={href} companyId={company.id} className="block hover:bg-muted/40">
      {row}
    </PlicaLink>
  ) : (
    row
  );

  return (
    <li data-ledger-row={item.id} className="text-[length:var(--plica-fs-body,14px)] leading-[1.45]">
      {subject.kind === "issue" ? (
        <PlicaIssueHover issueId={subject.id} anchorClassName="block min-w-0">
          {content}
        </PlicaIssueHover>
      ) : (
        content
      )}
    </li>
  );
}
