// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TICKLER_DEFAULT_PANE_ORDER, type TicklerPaneKey } from "../lib/pane-order";
import { TicklerPaneOrder } from "./TicklerPaneOrder";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The drag itself is not here, and cannot be: dnd-kit decides what a pointer is
 * over from the rows' bounding rects, and jsdom reports every element as zero by
 * zero, so nothing is ever over anything. What a finished drag does to the order
 * is `reorderPanes`, covered in `lib/pane-order.test.ts`; that the gesture
 * reaches it is covered by the 390px screenshots on the PR. What is left for
 * jsdom is the mechanic around it — that opening the menu is itself the edit
 * mode, and that a menu row never behaves like a menu item.
 */
const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

function render(order: readonly TicklerPaneKey[] = TICKLER_DEFAULT_PANE_ORDER) {
  const onOrder = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<TicklerPaneOrder order={order} onOrder={onOrder} />);
  });
  roots.push({ root, container });
  return { container, onOrder };
}

/** Radix opens its menu on pointerdown, which `HTMLElement.click()` does not fire. */
function press(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    element.click();
  });
}

/** The menu is portalled to `document.body`, so it is not inside the container. */
const menu = () => document.body.querySelector<HTMLElement>("[data-slot='dropdown-menu-content']");
const rows = () => Array.from(document.body.querySelectorAll<HTMLElement>("[data-pane-row]"));
const grips = () => Array.from(document.body.querySelectorAll<HTMLElement>("[aria-label^='Reorder ']"));

afterEach(() => {
  for (const { root, container } of roots.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  document.body.innerHTML = "";
});

describe("TicklerPaneOrder", () => {
  it("is an icon button until it is pressed", () => {
    // Labelled, not captioned: it sits in the header's toggle group beside
    // thresholds, alerts and kiosk, and those are icons with an aria-label.
    const { container } = render();
    const trigger = container.querySelector<HTMLElement>("[data-pane-order]");
    expect(trigger?.getAttribute("aria-label")).toBe("Pane order");
    expect(trigger?.textContent).toBe("");
    expect(trigger?.querySelector("svg")).not.toBeNull();
    expect(menu()).toBeNull();
  });

  it("lists the panes in the order it was given, not in source order", () => {
    const { container } = render(["recent", "queue", "routines", "orgs", "portfolio"]);
    press(container.querySelector<HTMLElement>("[data-pane-order]")!);
    expect(rows().map((row) => row.dataset.paneRow)).toEqual([
      "recent",
      "queue",
      "routines",
      "orgs",
      "portfolio",
    ]);
    expect(rows().map((row) => row.textContent)).toEqual([
      "Recent",
      "Needs you",
      "Routines",
      "Orgs",
      "Portfolio",
    ]);
  });

  it("opens straight into the grips, with no Edit step in front of them", () => {
    // The menu has no errand but reordering, so a mode toggle guarding it would
    // only ever be pressed on the way through.
    const { container } = render();
    press(container.querySelector<HTMLElement>("[data-pane-order]")!);
    expect(grips()).toHaveLength(5);
    expect(grips().map((grip) => grip.getAttribute("aria-label"))).toContain("Reorder Needs you");
    expect(document.body.textContent).not.toContain("Edit");
  });

  it("does not close the menu when a row is chosen", () => {
    // The rows are the setting, not five commands. Radix would dismiss on
    // select, which mid-reorder would drop the reader out of Edit as well.
    const { container } = render();
    press(container.querySelector<HTMLElement>("[data-pane-order]")!);
    act(() => rows()[2]!.click());
    expect(menu()).not.toBeNull();
    expect(grips()).toHaveLength(5);
  });

  it("reopens in the same state it closed in", () => {
    const { container } = render();
    const trigger = container.querySelector<HTMLElement>("[data-pane-order]")!;
    press(trigger);
    expect(trigger.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(menu()).toBeNull();
    expect(trigger.getAttribute("aria-pressed")).toBe("false");

    press(trigger);
    expect(grips()).toHaveLength(5);
  });

  it("does not report an order until something is dragged", () => {
    const { container, onOrder } = render();
    press(container.querySelector<HTMLElement>("[data-pane-order]")!);
    act(() => grips()[0]!.click());
    expect(onOrder).not.toHaveBeenCalled();
  });
});
