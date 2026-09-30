import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  distributeRailHeight,
  sameRailBudget,
  unbudgeted,
  type TicklerRailBudget,
  type TicklerRailPaneMetrics,
  type TicklerRailPaneSpec,
} from "../lib/rail-budget";
import { resolveScrollport } from "../lib/scrollport";

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
 *
 * `resolveScrollport` is the walk, and it answers `null` for the two cases where
 * the page itself scrolls — narrow hosts that leave `<main>` visible, and kiosk
 * mode, where the top-layer box is the screen and a scroller above it governs
 * nothing. There the document element is the band, and its `clientHeight` is the
 * viewport.
 */
function scrollPort(node: HTMLElement): HTMLElement | null {
  return resolveScrollport(node) ?? node.ownerDocument.documentElement;
}

/**
 * How far the rail's top sits below the top of the box it scrolls inside.
 *
 * Laid-out offsets rather than client rects, because `position: sticky` moves
 * where a box is painted without moving where it was laid out: a pinned rail
 * reports a rect at the top of the band, and sizing against that is how the
 * height starts changing under a scroll.
 */
function offsetWithin(node: HTMLElement, port: HTMLElement): number {
  const laidOutTop = (from: HTMLElement): number => {
    let top = 0;
    for (let el: HTMLElement | null = from; el; el = el.offsetParent as HTMLElement | null) top += el.offsetTop;
    return top;
  };
  return Math.max(0, laidOutTop(node) - laidOutTop(port));
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
 *
 * Those two cases are not the same thing, though, and `narrow` tells them
 * apart: unmeasured is a state that ends at the next frame, while `contents` is
 * a layout the rail will stay in until the window changes. A pane that has to
 * bound itself when nothing is bounding it — Recent, whose rows are the
 * fleet's and grow with it — needs to know which one it is in.
 */
export function useRailBudget(specs: readonly TicklerRailPaneSpec[]): {
  railRef: (node: HTMLDivElement | null) => void;
  budget: TicklerRailBudget;
  /** The rail is `display: contents`: one column, and no height to share out. */
  narrow: boolean;
} {
  const railRef = useRef<HTMLDivElement | null>(null);
  // Kept across renders because a demoted pane has no rows on the page to
  // measure: without the last heights it had, it could never be promoted back.
  const remembered = useRef<Record<string, TicklerRailPaneMetrics>>({});
  const [budget, setBudget] = useState<TicklerRailBudget>(() => unbudgeted(specs));
  // False until the rail has been looked at, which is the wide layout's answer
  // and also the one frame before the first measurement. Wrong for that frame
  // on a phone, but it is a pre-paint frame — `useLayoutEffect` runs before the
  // browser draws — so the panes are never seen unbounded.
  const [narrow, setNarrow] = useState(false);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    // Narrow: the rail is `display: contents`, its panes are grid items of the
    // page, and there is no column to share out. Anything written here would
    // be ignored anyway, so it is taken back rather than left behind for the
    // next time the window is wide.
    if (getComputedStyle(rail).display === "contents") {
      rail.style.height = "";
      rail.style.maxHeight = "";
      setNarrow(true);
      setBudget((current) => {
        const next = unbudgeted(specs);
        return sameRailBudget(current, next) ? current : next;
      });
      return;
    }
    setNarrow(false);
    // The rail is told its height here rather than in a class, because the band
    // it is pinned inside belongs to the host, not to the window.
    const port = scrollPort(rail);
    // Less what the rail starts below: the board's own header is inside the
    // scrolling box and above the rail, so at rest — which is where the page
    // opens, and where it stays until someone scrolls it — a rail given the
    // whole band hangs exactly that far below the fold. Measured at 2560×1400:
    // a 1308px rail starting 118px down a 1340px box, with Routines 65px past
    // the bottom of the screen. The offset is static, so the rail keeps one
    // height whatever the scroll position; once it pins at `top-4` the cost is
    // that much unused room under it, which is a gap rather than a clipped pane.
    const head = port ? Math.max(GUTTER, offsetWithin(rail, port)) : 0;
    const band = port ? Math.max(0, port.clientHeight - head - GUTTER) : 0;
    rail.style.height = band > 0 ? `${band}px` : "";
    // The `--tickler-rail-max-h` cap is the first-paint value and nothing more:
    // it is `100dvh` less an allowance for the host's chrome, so on a host with
    // less chrome than that allowance it is *shorter* than the band we just
    // measured, and would clip the panes the budget had just been told fit. A
    // measured rail answers to the measurement.
    rail.style.maxHeight = band > 0 ? "none" : "";
    for (const spec of specs) {
      const pane = rail.querySelector<HTMLElement>(`[data-rail-pane="${spec.key}"]`);
      if (!pane) continue;
      const rows = Array.from(pane.querySelectorAll<HTMLElement>("[data-rail-row]"));
      let foot = 0;
      for (const part of pane.querySelectorAll<HTMLElement>("[data-rail-foot]")) foot += part.offsetHeight;
      const held = remembered.current[spec.key];
      remembered.current[spec.key] = {
        head: pane.querySelector<HTMLElement>("[data-rail-head]")?.offsetHeight ?? 0,
        // A demoted pane draws neither rows nor footer. Measuring its footer as
        // nothing would cost it that much less to promote than it really costs,
        // and it would come back a footer too tall for the rail. An empty pane
        // still draws its "all 7 healthy" note, so it measures itself.
        foot: rows.length === 0 && foot === 0 ? (held?.foot ?? 0) : foot,
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

  return { railRef: attach, budget, narrow };
}
