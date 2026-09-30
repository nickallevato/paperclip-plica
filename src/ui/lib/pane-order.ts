/**
 * The order of the board's five panes down a one-column screen.
 *
 * Narrow, the board is a single grid column and its five panes are that
 * column's items, so their sequence is nothing but their `order` — see the
 * layout comment in `TicklerBoardPage`. This module owns which number each
 * pane gets; the page spends it as a class.
 *
 * Wide is not affected and cannot be: every pane carries
 * `@[64rem]/board:order-none`, so at the two-column breakpoint the numbers are
 * overridden away and the panes fall back to source order inside the rail. A
 * stored order is therefore a narrow-only preference by construction rather
 * than by the page remembering to ignore it.
 *
 * ## Where this is stored, and why it is only that
 *
 * `localStorage`, which makes the order per-browser: set it on a phone and a
 * desktop still opens the default. That is a limit and not a choice. A plugin
 * has no key/value store on the host — `/api/plugins/*` is board-only, so a
 * plugin's own UI cannot write there — and the one host table that looks close,
 * `sidebar-preferences`, holds the company/project order for the host's own
 * switcher under a schema that is a list of ids and nothing else. There is
 * nowhere to put five pane keys. A server-side store would have to be a core
 * change, which is out of bounds here.
 */
import { arrayMove } from "@dnd-kit/sortable";

export const TICKLER_PANE_ORDER_STORAGE_KEY = "tickler.paneOrder";

export type TicklerPaneKey = "orgs" | "queue" | "recent" | "portfolio" | "routines";

/**
 * The panes, in the order the narrow column opens with, each with the name the
 * Panes menu calls it. Queue is "Needs you" there because that is what its own
 * header says — "Queue" is the word for the page, not for the pane.
 */
export const TICKLER_PANES: readonly { key: TicklerPaneKey; label: string }[] = [
  { key: "orgs", label: "Orgs" },
  { key: "queue", label: "Needs you" },
  { key: "recent", label: "Recent" },
  { key: "portfolio", label: "Portfolio" },
  { key: "routines", label: "Routines" },
];

export const TICKLER_DEFAULT_PANE_ORDER: readonly TicklerPaneKey[] = TICKLER_PANES.map((pane) => pane.key);

/**
 * Tailwind cannot see a computed class name, so the five are written out.
 *
 * `order-${n}` is built from an index at runtime, which the utility scanner
 * never reads (`scripts/build-css.mjs` scans source text for candidates), so
 * the rules would simply not be in the sheet and every pane would sit at
 * `order: 0`. A literal lookup is the whole fix, and it is why this is a
 * record rather than a template string.
 */
const ORDER_CLASS = ["order-1", "order-2", "order-3", "order-4", "order-5"] as const;

/** The `order-N` class for a pane, given the order to draw it in. */
export function paneOrderClass(order: readonly TicklerPaneKey[], key: TicklerPaneKey): string {
  const index = order.indexOf(key);
  return ORDER_CLASS[index === -1 ? TICKLER_DEFAULT_PANE_ORDER.indexOf(key) : index];
}

/**
 * A stored order, made usable.
 *
 * Every answer is the five keys once each: unknown keys are dropped (a pane
 * this version does not have), duplicates are dropped, and anything missing is
 * appended in default order (a pane added in a later version, whose stored
 * order predates it — it lands at the bottom rather than vanishing). So a
 * partial or hand-edited value degrades to something that still draws.
 */
export function normalizePaneOrder(raw: string | null | undefined): TicklerPaneKey[] {
  const known = new Set<string>(TICKLER_DEFAULT_PANE_ORDER);
  const order: TicklerPaneKey[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const key of parsed) {
          if (typeof key !== "string" || !known.has(key) || order.includes(key as TicklerPaneKey)) continue;
          order.push(key as TicklerPaneKey);
        }
      }
    } catch {
      // not JSON — the default order is the answer
    }
  }
  for (const key of TICKLER_DEFAULT_PANE_ORDER) {
    if (!order.includes(key)) order.push(key);
  }
  return order;
}

/**
 * The whole of what a finished drag does to the order.
 *
 * Separated from the menu because a dnd-kit drag cannot be performed in jsdom
 * — it measures the rows it is moving between, and jsdom reports every element
 * as zero by zero — so this is the part that can be tested rather than
 * photographed. `arrayMove` is the same one the host's Orgs switcher uses.
 *
 * Answers the order unchanged for a drag that ended where it started or on
 * nothing, which is what a tap on a grip looks like.
 */
export function reorderPanes(
  order: readonly TicklerPaneKey[],
  activeId: string | number,
  overId: string | number | null | undefined,
): TicklerPaneKey[] {
  if (overId === null || overId === undefined || activeId === overId) return [...order];
  const from = order.indexOf(activeId as TicklerPaneKey);
  const to = order.indexOf(overId as TicklerPaneKey);
  if (from === -1 || to === -1) return [...order];
  return arrayMove([...order], from, to);
}
