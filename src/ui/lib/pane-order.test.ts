import { describe, expect, it } from "vitest";
import {
  normalizePaneOrder,
  paneOrderClass,
  reorderPanes,
  TICKLER_DEFAULT_PANE_ORDER,
  TICKLER_PANES,
  type TicklerPaneKey,
} from "./pane-order";

describe("normalizePaneOrder", () => {
  it("opens the board in source order when nothing is stored", () => {
    expect(normalizePaneOrder(null)).toEqual(["orgs", "queue", "recent", "portfolio", "routines"]);
    expect(normalizePaneOrder(undefined)).toEqual([...TICKLER_DEFAULT_PANE_ORDER]);
  });

  it("keeps a stored order", () => {
    const stored = JSON.stringify(["recent", "queue", "routines", "orgs", "portfolio"]);
    expect(normalizePaneOrder(stored)).toEqual(["recent", "queue", "routines", "orgs", "portfolio"]);
  });

  it("answers the five keys once each whatever it is given", () => {
    // A pane retired since the order was written, a pane added since, a
    // duplicate, and a value that is not a string at all.
    const stored = JSON.stringify(["recent", "gantt", "recent", 7, "queue"]);
    const order = normalizePaneOrder(stored);
    expect(order).toEqual(["recent", "queue", "orgs", "portfolio", "routines"]);
    expect(new Set(order).size).toBe(TICKLER_PANES.length);
  });

  it("falls back to the default rather than throwing on a value that is not JSON", () => {
    expect(normalizePaneOrder("{not json")).toEqual([...TICKLER_DEFAULT_PANE_ORDER]);
    expect(normalizePaneOrder(JSON.stringify({ orgs: 1 }))).toEqual([...TICKLER_DEFAULT_PANE_ORDER]);
  });
});

describe("paneOrderClass", () => {
  it("numbers the default order the way the markup used to spell it", () => {
    // These five were literals in TicklerBoardPage before PLI-262; a default
    // board has to still draw in exactly that sequence.
    expect(paneOrderClass(TICKLER_DEFAULT_PANE_ORDER, "orgs")).toBe("order-1");
    expect(paneOrderClass(TICKLER_DEFAULT_PANE_ORDER, "queue")).toBe("order-2");
    expect(paneOrderClass(TICKLER_DEFAULT_PANE_ORDER, "recent")).toBe("order-3");
    expect(paneOrderClass(TICKLER_DEFAULT_PANE_ORDER, "portfolio")).toBe("order-4");
    expect(paneOrderClass(TICKLER_DEFAULT_PANE_ORDER, "routines")).toBe("order-5");
  });

  it("renumbers every pane from one reordered list", () => {
    const order: TicklerPaneKey[] = ["queue", "recent", "orgs", "routines", "portfolio"];
    expect(TICKLER_PANES.map((pane) => paneOrderClass(order, pane.key))).toEqual([
      "order-3", // orgs
      "order-1", // queue
      "order-2", // recent
      "order-5", // portfolio
      "order-4", // routines
    ]);
  });

  it("emits only literal classes the utility scanner can have seen", () => {
    // `order-${n}` built at runtime would not be in the compiled sheet, so
    // every pane would land at `order: 0` and the stack would be source order
    // whatever was dragged. Guards the lookup table against being "simplified".
    const emitted = TICKLER_DEFAULT_PANE_ORDER.map((key) => paneOrderClass(TICKLER_DEFAULT_PANE_ORDER, key));
    for (const className of emitted) {
      expect(className).toMatch(/^order-[1-5]$/);
    }
  });

  it("falls back to the pane's default slot when the order does not name it", () => {
    expect(paneOrderClass(["queue"] as TicklerPaneKey[], "routines")).toBe("order-5");
  });
});

describe("reorderPanes", () => {
  it("moves the dragged pane to where it was dropped", () => {
    // Routines dragged to the top of the stack: everything above it shifts down
    // one, which is what `arrayMove` means and what a splice-in-place would not.
    expect(reorderPanes(TICKLER_DEFAULT_PANE_ORDER, "routines", "orgs")).toEqual([
      "routines",
      "orgs",
      "queue",
      "recent",
      "portfolio",
    ]);
  });

  it("moves down the list as well as up", () => {
    expect(reorderPanes(TICKLER_DEFAULT_PANE_ORDER, "orgs", "recent")).toEqual([
      "queue",
      "recent",
      "orgs",
      "portfolio",
      "routines",
    ]);
  });

  it("leaves the order alone for a drag that went nowhere", () => {
    expect(reorderPanes(TICKLER_DEFAULT_PANE_ORDER, "queue", "queue")).toEqual([...TICKLER_DEFAULT_PANE_ORDER]);
    // Released outside every row: dnd-kit reports no `over`.
    expect(reorderPanes(TICKLER_DEFAULT_PANE_ORDER, "queue", null)).toEqual([...TICKLER_DEFAULT_PANE_ORDER]);
    expect(reorderPanes(TICKLER_DEFAULT_PANE_ORDER, "queue", undefined)).toEqual([...TICKLER_DEFAULT_PANE_ORDER]);
  });

  it("is a no-op for an id that is not a pane", () => {
    expect(reorderPanes(TICKLER_DEFAULT_PANE_ORDER, "gantt", "orgs")).toEqual([...TICKLER_DEFAULT_PANE_ORDER]);
    expect(reorderPanes(TICKLER_DEFAULT_PANE_ORDER, "orgs", "gantt")).toEqual([...TICKLER_DEFAULT_PANE_ORDER]);
  });

  it("answers a new array, never the one it was given", () => {
    const order = [...TICKLER_DEFAULT_PANE_ORDER];
    expect(reorderPanes(order, "queue", "queue")).not.toBe(order);
  });
});
