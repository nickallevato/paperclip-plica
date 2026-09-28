import { useCallback, useEffect, useState } from "react";
import { measureRailMaxHeight, resolveScrollport } from "../lib/scrollport";

/** Sticky offset at the top of the rail, and the same gap left under it. */
const GUTTER_PX = 32;

/**
 * The px cap for the board's sticky left rail — the height of the scroller it is
 * pinned inside, less a gutter. See `lib/scrollport` for why the window's height
 * is the wrong number.
 *
 * Returns a callback ref plus the measurement: `null` until one lands (and in
 * any environment without `ResizeObserver`), which is the caller's cue to leave
 * the CSS fallback cap in place.
 *
 * Re-measures when the scroller resizes — the host sidebar collapsing, the
 * window changing, entering or leaving kiosk mode.
 */
export function useRailMaxHeight(): [(node: HTMLElement | null) => void, number | null] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;
    const view = el.ownerDocument?.defaultView;
    if (!view) return;
    const measure = () => setMaxHeight(measureRailMaxHeight(el, GUTTER_PX));
    measure();

    // The rail is pinned inside the host's scroller, so it is that box changing
    // size that invalidates the cap — not the rail's own contents.
    let observer: ResizeObserver | undefined;
    if (typeof view.ResizeObserver === "function") {
      observer = new view.ResizeObserver(measure);
      observer.observe(resolveScrollport(el) ?? el.ownerDocument.documentElement);
    }
    view.addEventListener("resize", measure);
    // Fullscreen swaps the scrollport for the screen without resizing anything
    // the observer is watching on the way in.
    el.ownerDocument.addEventListener("fullscreenchange", measure);
    return () => {
      observer?.disconnect();
      view.removeEventListener("resize", measure);
      el.ownerDocument.removeEventListener("fullscreenchange", measure);
    };
  }, [el]);

  return [ref, maxHeight];
}
