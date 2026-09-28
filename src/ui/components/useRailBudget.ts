import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  distributeRailHeight,
  sameRailBudget,
  unbudgeted,
  type TicklerRailBudget,
  type TicklerRailPaneMetrics,
  type TicklerRailPaneSpec,
} from "../lib/rail-budget";

/** Fallback when the rail has no computed gap to read — matches `gap-4`. */
const FALLBACK_GAP = 16;

/** Enough rows to find the tallest one without walking a hundred of them. */
const ROW_SAMPLE = 12;

/**
 * Measure the rail and hand each pane its height.
 *
 * The panes mark themselves up for this: `data-rail-pane` on the pane,
 * `data-rail-head` on its header, `data-rail-foot` on anything else that is not
 * a row, and `data-rail-row` on each row. Nothing is measured by class name and
 * no height is a constant, so the budget survives a density change, a font
 * change and a theme that sets its own line height.
 *
 * Returns a ref for the rail and a budget keyed by pane. Until the rail has a
 * height — the narrow layout, where the rail is `display: contents` and has no
 * box at all; a test in jsdom, where everything measures zero — every pane is
 * unbudgeted and sizes itself exactly as it did before.
 */
export function useRailBudget(specs: readonly TicklerRailPaneSpec[]): {
  railRef: (node: HTMLDivElement | null) => void;
  budget: TicklerRailBudget;
} {
  const railRef = useRef<HTMLDivElement | null>(null);
  // Kept across renders because a demoted pane has no rows on the page to
  // measure: without the last heights it had, it could never be promoted back.
  const remembered = useRef<Record<string, TicklerRailPaneMetrics>>({});
  const [budget, setBudget] = useState<TicklerRailBudget>(() => unbudgeted(specs));

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    for (const spec of specs) {
      const pane = rail.querySelector<HTMLElement>(`[data-rail-pane="${spec.key}"]`);
      if (!pane) continue;
      const rows = Array.from(pane.querySelectorAll<HTMLElement>("[data-rail-row]"));
      let foot = 0;
      for (const part of pane.querySelectorAll<HTMLElement>("[data-rail-foot]")) foot += part.offsetHeight;
      const held = remembered.current[spec.key];
      remembered.current[spec.key] = {
        head: pane.querySelector<HTMLElement>("[data-rail-head]")?.offsetHeight ?? 0,
        foot,
        // The tallest of the sample rather than the first: Portfolio's sticky
        // company headings are rows too and are shorter than a project's bar,
        // and a row height that under-measures puts the half-drawn row back.
        row: rows.length
          ? Math.max(...rows.slice(0, ROW_SAMPLE).map((row) => row.offsetHeight))
          : (held?.row ?? 0),
        frame: pane.offsetHeight - pane.clientHeight,
        total: rows.length || (held?.total ?? 0),
      };
    }
    const gap = Number.parseFloat(getComputedStyle(rail).rowGap);
    const next = distributeRailHeight(specs, remembered.current, {
      available: rail.clientHeight,
      gap: Number.isFinite(gap) ? gap : FALLBACK_GAP,
    });
    setBudget((current) => (sameRailBudget(current, next) ? current : next));
  }, [specs]);

  // After every render, because the rail's contents are the thing that changes:
  // a run starts, an org is watched, a routine recovers. Reading a header, a
  // footer and a dozen row heights is cheap, and the budget is only applied
  // when it differs, so this settles in one pass and cannot loop.
  useLayoutEffect(measure);

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      railRef.current = node;
      if (!node || typeof ResizeObserver === "undefined") return;
      // The rail's own height is set by the viewport, not by what we write into
      // the panes, so observing it cannot feed back into itself.
      const observer = new ResizeObserver(() => measure());
      observer.observe(node);
      return () => observer.disconnect();
    },
    [measure],
  );

  return { railRef: attach, budget };
}
