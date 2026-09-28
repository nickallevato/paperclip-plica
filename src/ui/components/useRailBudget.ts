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

/** Above and below the rail when it is pinned — the `top-4` it sticks at, twice. */
const GUTTER = 16;

/**
 * The box the rail is pinned inside, which is not the window.
 *
 * The host scrolls an inner `<main>` rather than the document, and that element
 * is both shorter than the viewport and offset down it. A rail sized at
 * `100vh - 2rem` — which is what it was — is therefore taller than the band it
 * can ever occupy, and the pane at the bottom hangs below the fold: exactly the
 * complaint this work exists to answer, arrived at from the other direction.
 */
function scrollPort(node: HTMLElement): HTMLElement | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll|overlay/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return node.ownerDocument.scrollingElement as HTMLElement | null;
}

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
    // Narrow: the rail is `display: contents`, its panes are grid items of the
    // page, and there is no column to share out. Anything written here would
    // be ignored anyway, so it is taken back rather than left behind for the
    // next time the window is wide.
    if (getComputedStyle(rail).display === "contents") {
      rail.style.height = "";
      setBudget((current) => {
        const next = unbudgeted(specs);
        return sameRailBudget(current, next) ? current : next;
      });
      return;
    }
    // The rail is told its height here rather than in a class, because the band
    // it is pinned inside belongs to the host, not to the window.
    const port = scrollPort(rail);
    const band = port ? Math.max(0, port.clientHeight - 2 * GUTTER) : 0;
    rail.style.height = band > 0 ? `${band}px` : "";
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
      available: band,
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
      // The scrolling box, not the rail: the rail's height is the thing being
      // written, and observing what you write is how a layout loop starts. The
      // box it is pinned inside changes only when the window does.
      const port = scrollPort(node);
      if (!port) return;
      const observer = new ResizeObserver(() => measure());
      observer.observe(port);
      return () => observer.disconnect();
    },
    [measure],
  );

  return { railRef: attach, budget };
}
