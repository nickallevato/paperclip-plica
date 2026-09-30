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
 * jsdom is the mechanic around it — that the grips appear only while editing,
 * and that a menu row never behaves like a menu item.
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
const editButton = () => document.body.querySelector<HTMLElement>("[data-pane-order-edit]");

afterEach(() => {
  for (const { root, container } of roots.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  document.body.innerHTML = "";
});

describe("TicklerPaneOrder", () => {
  it("is a button until it is pressed", () => {
    const { container } = render();
    const trigger = container.querySelector<HTMLElement>("[data-pane-order]");
    expect(trigger?.textContent).toBe("Panes");
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

  it("shows a grip on every row only while editing, and takes them all back on Done", () => {
    const { container } = render();
    press(container.querySelector<HTMLElement>("[data-pane-order]")!);
    expect(editButton()?.textContent).toBe("Edit");
    expect(grips()).toHaveLength(0);

    act(() => editButton()!.click());
    expect(editButton()?.textContent).toBe("Done");
    expect(grips()).toHaveLength(5);
    expect(grips().map((grip) => grip.getAttribute("aria-label"))).toContain("Reorder Needs you");

    act(() => editButton()!.click());
    expect(editButton()?.textContent).toBe("Edit");
    expect(grips()).toHaveLength(0);
  });

  it("does not close the menu when a row is chosen", () => {
    // The rows are the setting, not five commands. Radix would dismiss on
    // select, which mid-reorder would drop the reader out of Edit as well.
    const { container } = render();
    press(container.querySelector<HTMLElement>("[data-pane-order]")!);
    act(() => editButton()!.click());
    act(() => rows()[2]!.click());
    expect(menu()).not.toBeNull();
    expect(editButton()?.textContent).toBe("Done");
  });

  it("reopens showing the list rather than the grips", () => {
    const { container } = render();
    const trigger = container.querySelector<HTMLElement>("[data-pane-order]")!;
    press(trigger);
    act(() => editButton()!.click());
    expect(grips()).toHaveLength(5);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(menu()).toBeNull();

    press(trigger);
    expect(editButton()?.textContent).toBe("Edit");
    expect(grips()).toHaveLength(0);
  });

  it("does not report an order until something is dragged", () => {
    const { container, onOrder } = render();
    press(container.querySelector<HTMLElement>("[data-pane-order]")!);
    act(() => editButton()!.click());
    act(() => grips()[0]!.click());
    expect(onOrder).not.toHaveBeenCalled();
  });
});
