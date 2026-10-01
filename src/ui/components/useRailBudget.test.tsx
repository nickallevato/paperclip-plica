// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { TicklerRailPaneSpec } from "../lib/rail-budget";
import { railPaneBox } from "./TicklerRailPane";
import { useRailBudget } from "./useRailBudget";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PANES: TicklerRailPaneSpec[] = [
  { key: "orgs", minRows: 3, idealRows: Infinity, priority: 1 },
  { key: "portfolio", minRows: 3, idealRows: 11, priority: 2 },
];

/**
 * A rail the hook can measure.
 *
 * jsdom lays nothing out, so every rect it reports is zero — which is exactly
 * the unmeasured case the hook already has to survive. To exercise the measured
 * case, geometry is stubbed onto the element prototypes by the `data-*` markers
 * the panes carry: 28px headers, 20px footers, 32px rows, and a scrolling box
 * of whatever height the test asks for. The rail gets that height less a 16px
 * gutter top and bottom, which is the hook's own arithmetic.
 *
 * Rects rather than `offsetHeight`, because that is what the hook reads now:
 * `offsetHeight` is an integer and a rail row rarely is, and a budget built
 * from the floor of its own rows is a pane that scrolls by the fraction it was
 * docked (PLI-263). `rowHeight` is therefore a parameter — a test can hand it
 * 32.375 and ask what the pane was pinned to.
 */
function stubGeometry(portHeight: number, railTop = 0, rowHeight = 32): () => void {
  const height = (node: HTMLElement): number => {
    if (node.dataset.railHead !== undefined) return 28;
    if (node.dataset.railFoot !== undefined) return 20;
    if (node.dataset.railRow !== undefined) return rowHeight;
    return 0;
  };
  const rect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "getBoundingClientRect");
  const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      return { height: height(this), width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.rail === "port" ? portHeight : 0;
    },
  });
  // What the rail starts below inside the scrolling box — the board's own
  // header, in the app. jsdom reports every `offsetTop` as zero, which is the
  // pinned case; a test asks for the resting one by passing a height.
  const top = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.rail === "rail" ? railTop : 0;
    },
  });
  return () => {
    if (rect) Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", rect);
    if (client) Object.defineProperty(HTMLElement.prototype, "clientHeight", client);
    if (top) Object.defineProperty(HTMLElement.prototype, "offsetTop", top);
  };
}

function Rail({ orgRows, projectRows, contents }: { orgRows: number; projectRows: number; contents?: boolean }) {
  const { railRef, budget, narrow } = useRailBudget(PANES);
  const pane = (key: string, rows: number) => {
    const box = railPaneBox(budget[key]);
    return (
      <section
        data-rail-pane={key}
        data-demoted={budget[key]?.demoted}
        data-rows={budget[key]?.rows}
        // The 2px of frame the pane's height has to carry, written as the
        // border it is in the app: the hook reads it off the computed style
        // rather than as `offsetHeight - clientHeight`, which is two roundings.
        style={{ borderTopWidth: "1px", borderBottomWidth: "1px", ...box.style }}
        className={box.className}
      >
        <div data-rail-head>{key}</div>
        {!budget[key]?.demoted && (
          <ul>
            {Array.from({ length: rows }, (_, index) => (
              <li key={index} data-rail-row />
            ))}
          </ul>
        )}
        <p data-rail-foot />
      </section>
    );
  };
  return (
    // The host's scrolling box, which is what the hook measures the rail
    // against — not the window.
    <div data-rail="port" style={{ overflowY: "auto" }}>
      <div
        ref={railRef}
        data-rail="rail"
        data-narrow={narrow}
        // The narrow layout, where the panes are grid items of the page and the
        // rail is not a box at all. In the app this comes from the container
        // query on the class; here it is asked for outright.
        style={contents ? { display: "contents" } : undefined}
      >
        {pane("orgs", orgRows)}
        {pane("portfolio", projectRows)}
      </div>
    </div>
  );
}

let teardown: (() => void)[] = [];

/** `portHeight` is the scrolling box; the rail gets 32px less than it. */
function render(
  portHeight: number,
  rows: { orgRows: number; projectRows: number; contents?: boolean } = { orgRows: 12, projectRows: 11 },
  railTop = 0,
  rowHeight = 32,
): HTMLDivElement {
  teardown.push(stubGeometry(portHeight, railTop, rowHeight));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Rail {...rows} />);
  });
  teardown.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

afterEach(() => {
  for (const undo of teardown.reverse()) undo();
  teardown = [];
});

const pane = (container: HTMLElement, key: string) =>
  container.querySelector<HTMLElement>(`[data-rail-pane="${key}"]`)!;

describe("useRailBudget", () => {
  it("gives the rail the band it is pinned inside, not the window", () => {
    const container = render(632);
    expect(container.querySelector<HTMLElement>("[data-rail='rail']")!.style.height).toBe("600px");
  });

  it("leaves out what the rail starts below, so the last pane is above the fold", () => {
    // The page opens at the top, where the rail begins under the board's own
    // header rather than at the top of the scrolling box. A rail given the
    // whole band there is that much taller than the screen, and the bottom
    // pane hangs off it: 632 less a 118px header and one 16px gutter, not
    // less two gutters.
    const container = render(632, { orgRows: 12, projectRows: 11 }, 118);
    expect(container.querySelector<HTMLElement>("[data-rail='rail']")!.style.height).toBe("498px");
  });

  it("pins each pane to a header plus whole rows", () => {
    const container = render(632);
    // 600px, less two 2px borders, two 28px headers, two 20px footers and one
    // 16px gap, leaves 484px for 32px rows: fifteen of them, handed out
    // round-robin from each pane's minimum of three — eight and seven.
    expect(pane(container, "orgs").style.height).toBe("306px");
    expect(pane(container, "portfolio").style.height).toBe("274px");
    for (const key of ["orgs", "portfolio"]) {
      const height = Number.parseInt(pane(container, key).style.height, 10);
      expect((height - 2 - 28 - 20) % 32, key).toBe(0);
    }
  });

  // PLI-263: the rows were measured with `offsetHeight`, so a 28.375px row was
  // budgeted 28 and a pane showing three of them was pinned a pixel short of
  // its own contents — a scrollbar on a pane whose header says it is holding
  // nothing back. Pinned to no less than the rows need, and to a whole pixel.
  it("never pins a pane below the rows it is showing, however they measure", () => {
    const container = render(632, { orgRows: 12, projectRows: 11 }, 0, 32.375);
    for (const key of ["orgs", "portfolio"]) {
      const height = Number.parseInt(pane(container, key).style.height, 10);
      const rows = Number.parseInt(pane(container, key).dataset.rows!, 10);
      expect(height, key).toBeGreaterThanOrEqual(2 + 28 + 20 + rows * 32.375);
      expect(height, key).toBe(Math.ceil(height));
    }
  });

  it("gives a taller rail's height away instead of holding a cap", () => {
    const short = render(632);
    const tall = render(1032);
    expect(Number.parseInt(pane(tall, "portfolio").style.height, 10)).toBeGreaterThan(
      Number.parseInt(pane(short, "portfolio").style.height, 10),
    );
  });

  it("demotes a pane it cannot seat, and can measure it again once demoted", () => {
    const container = render(252);
    expect(pane(container, "orgs").dataset.demoted).toBe("false");
    expect(pane(container, "portfolio").dataset.demoted).toBe("true");
    expect(pane(container, "portfolio").style.height).toBe("");
    // The demoted pane has no rows left on the page. Its remembered row height
    // is what keeps a re-measure from reading it as unmeasured and dropping the
    // whole budget — which would un-pin the pane above it too.
    expect(pane(container, "orgs").style.height).not.toBe("");
  });

  it("reports the narrow layout, and tells it apart from an unmeasured rail", () => {
    const narrow = render(632, { orgRows: 12, projectRows: 11, contents: true });
    const rail = narrow.querySelector<HTMLElement>("[data-rail='rail']")!;
    // No height written and no pane pinned: `display: contents` means the panes
    // are grid items of the page and anything written here is ignored.
    expect(rail.dataset.narrow).toBe("true");
    expect(rail.style.height).toBe("");
    expect(pane(narrow, "orgs").style.height).toBe("");
    // A rail with a box is not narrow even when there is nothing to measure —
    // that one is over at the next frame, and a pane capping itself for it
    // would cap itself on every host without a ResizeObserver.
    expect(render(0).querySelector<HTMLElement>("[data-rail='rail']")!.dataset.narrow).toBe("false");
  });

  it("leaves the panes alone when nothing can be measured", () => {
    const container = render(0);
    expect(pane(container, "orgs").style.height).toBe("");
    expect(pane(container, "orgs").dataset.demoted).toBe("false");
    expect(pane(container, "portfolio").style.height).toBe("");
  });
});
