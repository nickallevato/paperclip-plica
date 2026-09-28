import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRailMaxHeight } from "./useRailMaxHeight";

/**
 * jsdom has no layout, so `clientHeight` is 0 on everything until stubbed — which
 * is also the real first-paint case the hook has to survive. These tests stub the
 * host scroller's height and drive the observer by hand.
 */

const observers: Array<{ targets: Element[]; fire: () => void }> = [];

function installResizeObserver(): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      targets: Element[] = [];
      constructor(private callback: () => void) {
        observers.push({ targets: this.targets, fire: () => this.callback() });
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      disconnect() {}
      unobserve() {}
    },
  );
}

/**
 * A host-like shell. `scrolls` picks which layout Tickler is in: Paperclip's
 * desktop `<main overflow:auto>`, or the mobile/kiosk case where the window
 * scrolls instead.
 */
function Harness({ onHeight, scrolls = true }: { onHeight: (px: number | null) => void; scrolls?: boolean }) {
  const [ref, maxHeight] = useRailMaxHeight();
  onHeight(maxHeight);
  return (
    <main data-testid="scroller" style={scrolls ? { overflowY: "auto" } : undefined}>
      <div ref={ref} data-testid="rail" />
    </main>
  );
}

function setHeight(el: Element, px: number): void {
  Object.defineProperty(el, "clientHeight", { value: px, configurable: true });
}

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
});

describe("useRailMaxHeight", () => {
  it("measures the scrolling ancestor, not the window", () => {
    installResizeObserver();
    // A window taller than the host scroller is the whole bug: Paperclip's
    // chrome sits above `<main>`, so `100vh` overshoots the pinned rail's box.
    window.innerHeight = 1000;
    const heights: Array<number | null> = [];
    const { getByTestId } = render(<Harness onHeight={(px) => heights.push(px)} />);
    setHeight(getByTestId("scroller"), 700);
    act(() => observers.at(-1)!.fire());
    expect(heights.at(-1)).toBe(668);
  });

  it("observes the scroller it measured", () => {
    installResizeObserver();
    const { getByTestId } = render(<Harness onHeight={() => {}} />);
    expect(observers.at(-1)!.targets).toEqual([getByTestId("scroller")]);
  });

  it("stays null while nothing measurable is on screen", () => {
    installResizeObserver();
    const heights: Array<number | null> = [];
    render(<Harness onHeight={(px) => heights.push(px)} />);
    // The scroller is still 0 tall: keep the CSS fallback rather than pin to ~0.
    expect(heights.at(-1)).toBeNull();
  });

  it("falls back to the window when nothing between the rail and the root scrolls", () => {
    installResizeObserver();
    window.innerHeight = 900;
    const heights: Array<number | null> = [];
    render(<Harness scrolls={false} onHeight={(px) => heights.push(px)} />);
    expect(heights.at(-1)).toBe(868);
  });

  it("still measures without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    window.innerHeight = 900;
    const heights: Array<number | null> = [];
    expect(() => render(<Harness scrolls={false} onHeight={(px) => heights.push(px)} />)).not.toThrow();
    expect(heights.at(-1)).toBe(868);
    expect(observers).toHaveLength(0);
  });
});
