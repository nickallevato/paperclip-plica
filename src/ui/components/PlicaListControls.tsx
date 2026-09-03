import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { cn } from "../host/util";

const MICRO = "text-[length:var(--plica-fs-micro,11px)] leading-[1.45]";

/**
 * The grouping + sort-direction pair that sits in a rail header.
 *
 * Grouping decides the boxes, direction decides the order inside them; they are
 * drawn together because they are read together. Shared by the queue and the
 * projects rail so the same click means the same thing in both.
 */
export function PlicaListControls<G extends string, S extends string>({
  groupings,
  grouping,
  onGrouping,
  groupingLabel,
  sorts,
  sort,
  onSort,
}: {
  groupings: ReadonlyArray<{ grouping: G; label: string }>;
  grouping: G;
  onGrouping: (grouping: G) => void;
  /** Accessible name for the segmented group, e.g. "Queue grouping". */
  groupingLabel: string;
  /** The two directions, first is the default; `label` is the button's text. */
  sorts: readonly [{ sort: S; label: string }, { sort: S; label: string }];
  sort: S;
  onSort: (sort: S) => void;
}) {
  const [first, second] = sorts;
  const flipped = sort === second.sort;
  const current = flipped ? second : first;
  const next = flipped ? first : second;
  return (
    <>
      <button
        type="button"
        aria-label={`Sort ${next.label} first`}
        aria-pressed={flipped}
        title={`Within each group: ${current.label} first`}
        onClick={() => onSort(next.sort)}
        className={cn(
          "ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
          MICRO,
          "text-muted-foreground hover:text-foreground",
        )}
      >
        {flipped ? <ArrowUpNarrowWide className="h-3 w-3" /> : <ArrowDownWideNarrow className="h-3 w-3" />}
        {current.label}
      </button>
      <div role="group" aria-label={groupingLabel} className="flex items-center rounded-md border p-0.5">
        {groupings.map(({ grouping: mode, label }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={grouping === mode}
            onClick={() => onGrouping(mode)}
            className={cn(
              "rounded px-2 py-0.5",
              MICRO,
              grouping === mode ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
