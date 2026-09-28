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
 * jsdom lays nothing out, so every `offsetHeight` it reports is zero — which is
 * exactly the unmeasured case the hook already has to survive. To exercise the
 * measured case, geometry is stubbed onto the element prototypes by the
 * `data-*` markers the panes carry: 28px headers, 20px footers, 32px rows, and
 * a scrolling box of whatever height the test asks for. The rail gets that
 * height less a 16px gutter top and bottom, which is the hook's own arithmetic.
 */
function stubGeometry(portHeight: number): () => void {
  const height = (node: HTMLElement): number => {
    if (node.dataset.railHead !== undefined) return 28;
    if (node.dataset.railFoot !== undefined) return 20;
    if (node.dataset.railRow !== undefined) return 32;
    // Only the panes read offsetHeight for themselves, and only to work out the
    // border their own height has to carry.
    if (node.dataset.railPane !== undefined) return node.clientHeight + 2;
    return 0;
  };
  const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return height(this);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.rail === "port" ? portHeight : 0;
    },
  });
  return () => {
    if (offset) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offset);
    if (client) Object.defineProperty(HTMLElement.prototype, "clientHeight", client);
  };
}

function Rail({ orgRows, projectRows }: { orgRows: number; projectRows: number }) {
  const { railRef, budget } = useRailBudget(PANES);
  const pane = (key: string, rows: number) => {
    const box = railPaneBox(budget[key]);
    return (
      <section data-rail-pane={key} data-demoted={budget[key]?.demoted} style={box.style} className={box.className}>
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
      <div ref={railRef} data-rail="rail">
        {pane("orgs", orgRows)}
        {pane("portfolio", projectRows)}
      </div>
    </div>
  );
}

let teardown: (() => void)[] = [];

/** `portHeight` is the scrolling box; the rail gets 32px less than it. */
function render(portHeight: number, rows = { orgRows: 12, projectRows: 11 }): HTMLDivElement {
  teardown.push(stubGeometry(portHeight));
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

  it("leaves the panes alone when nothing can be measured", () => {
    const container = render(0);
    expect(pane(container, "orgs").style.height).toBe("");
    expect(pane(container, "orgs").dataset.demoted).toBe("false");
    expect(pane(container, "portfolio").style.height).toBe("");
  });
});
