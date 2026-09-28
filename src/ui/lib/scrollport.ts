/**
 * Finds the element that actually scrolls Tickler's page, and how tall it is.
 *
 * Why this exists: the board's left rail is `position: sticky`, and a sticky
 * element is pinned inside its *scrollport* — not inside the window. Paperclip
 * scrolls `<main id="main-content">` (`overflow: auto`), which starts below the
 * host's top bar and breadcrumb, so the window is always taller than the
 * scrollport. A rail capped at `100vh - 2rem` is therefore taller than the
 * space it is pinned into: its bottom hangs below the scrollport's edge, and
 * because it is pinned it never scrolls up to reveal itself. That is PLI-243 —
 * the rail reads as cut off and appears to move only while the main column
 * scrolls (before the sticky offset engages).
 *
 * Measuring the scrollport instead of the window fixes the cap wherever Tickler
 * is mounted, including hosts whose chrome is a different height, and needs
 * nothing from the host but the DOM the plugin is already rendered into.
 */

/** The slice of the DOM this module needs, so tests can hand it plain objects. */
export interface NodeLike {
  parentElement: NodeLike | null;
  clientHeight: number;
}

/** How `overflow-y` reads on a box that scrolls its overflow. */
const SCROLLS = new Set(["auto", "scroll", "overlay"]);

/**
 * The nearest ancestor of `el` that scrolls, or `null` when the page itself
 * (the window) is the scroller.
 *
 * `stopAt` bounds the walk: pass the fullscreen element in kiosk mode, where
 * the top-layer box is sized to the screen and any scrolling ancestor above it
 * no longer governs anything on screen.
 */
export function findScrollport<T extends NodeLike>(
  el: T,
  overflowY: (node: T) => string,
  stopAt?: T | null,
): T | null {
  for (let node = el.parentElement as T | null; node; node = node.parentElement as T | null) {
    if (SCROLLS.has(overflowY(node))) return node;
    if (stopAt && node === stopAt) return null;
  }
  return null;
}

/**
 * The tallest the rail may be, in px: the visible height of whatever scrolls
 * it, less `gutter` — one sticky offset at the top and the same breathing room
 * at the bottom, so the last panel's border is not flush with the edge.
 *
 * Returns `null` when nothing usable was measured (a detached node, a zero-height
 * scrollport mid-layout), so the caller can leave the CSS fallback in place
 * rather than pin the rail to 0.
 */
export function railMaxHeight(scrollportHeight: number, gutter: number): number | null {
  if (!Number.isFinite(scrollportHeight) || scrollportHeight <= gutter) return null;
  return scrollportHeight - gutter;
}

/**
 * DOM-bound `findScrollport`: the box that scrolls `el`, or `null` when the
 * window does (mobile, where the host leaves `<main>` `overflow: visible`, and
 * kiosk mode, where the top-layer box is the screen).
 */
export function resolveScrollport(el: HTMLElement): HTMLElement | null {
  const view = el.ownerDocument?.defaultView;
  if (!view) return null;
  const fullscreen = el.ownerDocument.fullscreenElement as HTMLElement | null;
  return findScrollport(
    el,
    (node) => view.getComputedStyle(node).overflowY,
    fullscreen && fullscreen.contains(el) ? fullscreen : null,
  );
}

/** DOM-bound convenience wrapper: the px cap for a rail mounted at `el`. */
export function measureRailMaxHeight(el: HTMLElement, gutter: number): number | null {
  const view = el.ownerDocument?.defaultView;
  if (!view) return null;
  const scrollport = resolveScrollport(el);
  return railMaxHeight(scrollport ? scrollport.clientHeight : view.innerHeight, gutter);
}
