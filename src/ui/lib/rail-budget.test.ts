import { describe, expect, it } from "vitest";
import {
  distributeRailHeight,
  sameRailBudget,
  unbudgeted,
  type TicklerRailPaneMetrics,
  type TicklerRailPaneSpec,
} from "./rail-budget";

/** The board's own four panes, so the numbers under test are the real ones. */
const PANES: TicklerRailPaneSpec[] = [
  { key: "orgs", minRows: 3, idealRows: Infinity, priority: 1 },
  { key: "portfolio", minRows: 3, idealRows: 11, priority: 2 },
  { key: "recent", minRows: 3, idealRows: 12, priority: 3 },
  { key: "routines", minRows: 2, idealRows: 4, priority: 4 },
];

/** A measured pane: 28px of header, a 20px footer, 32px rows, a 2px border. */
function box(total: number, over: Partial<TicklerRailPaneMetrics> = {}): TicklerRailPaneMetrics {
  return { head: 28, foot: 20, row: 32, frame: 2, total, ...over };
}

function metrics(totals: Record<string, number>): Record<string, TicklerRailPaneMetrics> {
  return Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, box(total)]));
}

const GAP = 16;

/** What the rail is asked to draw, as one number, for comparing against `available`. */
function spent(budget: ReturnType<typeof distributeRailHeight>, boxes: Record<string, TicklerRailPaneMetrics>): number {
  let total = GAP * (PANES.length - 1);
  for (const { key } of PANES) {
    const pane = budget[key]!;
    total += pane.height ?? boxes[key].frame + boxes[key].head + (boxes[key].total === 0 ? boxes[key].foot : 0);
  }
  return total;
}

describe("distributeRailHeight", () => {
  it("leaves every pane to size itself until the rail has a height", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 3 });
    expect(distributeRailHeight(PANES, boxes, { available: 0, gap: GAP })).toEqual(unbudgeted(PANES));
  });

  it("leaves every pane to size itself while any one of them is unmeasured", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20 });
    expect(distributeRailHeight(PANES, boxes, { available: 900, gap: GAP })).toEqual(unbudgeted(PANES));
  });

  it("treats a pane with rows but no measured row height as unmeasured", () => {
    const boxes = { ...metrics({ orgs: 12, portfolio: 11, routines: 3 }), recent: box(20, { row: 0 }) };
    expect(distributeRailHeight(PANES, boxes, { available: 900, gap: GAP })).toEqual(unbudgeted(PANES));
  });

  // The failure that opened PLI-246: twelve orgs pushed Portfolio off the
  // bottom of the screen, because Orgs had no cap of any kind.
  it("keeps every pane on a short screen with twelve orgs", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 3 });
    const budget = distributeRailHeight(PANES, boxes, { available: 758, gap: GAP });
    for (const { key } of PANES) expect(budget[key]!.demoted, key).toBe(false);
    expect(spent(budget, boxes)).toBeLessThanOrEqual(758);
  });

  it("never draws part of a row", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 3 });
    const budget = distributeRailHeight(PANES, boxes, { available: 903, gap: GAP });
    for (const { key } of PANES) {
      const pane = budget[key]!;
      expect(pane.height, key).toBe(boxes[key].frame + boxes[key].head + boxes[key].foot + pane.rows * boxes[key].row);
    }
  });

  it("spends a taller screen instead of holding a pixel cap", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 3 });
    const short = distributeRailHeight(PANES, boxes, { available: 790, gap: GAP });
    const tall = distributeRailHeight(PANES, boxes, { available: 1400, gap: GAP });
    for (const { key } of PANES) expect(tall[key]!.rows, key).toBeGreaterThanOrEqual(short[key]!.rows);
    expect(tall.recent!.rows).toBeGreaterThan(short.recent!.rows);
    expect(spent(tall, boxes)).toBeLessThanOrEqual(1400);
  });

  it("stops at each pane's ideal rather than handing one pane the whole screen", () => {
    const boxes = metrics({ orgs: 12, portfolio: 40, recent: 60, routines: 9 });
    const budget = distributeRailHeight(PANES, boxes, { available: 4000, gap: GAP });
    expect(budget.orgs!.rows).toBe(12);
    expect(budget.portfolio!.rows).toBe(11);
    expect(budget.recent!.rows).toBe(12);
    expect(budget.routines!.rows).toBe(4);
    for (const { key } of PANES) expect(budget[key]!.hidden, key).toBe(boxes[key].total - budget[key]!.rows);
  });

  // Priority buys a place in the queue, not a place on the page: a pane whose
  // minimum will not fit is passed over, and a cheaper pane behind it is still
  // served. Two routine failures are worth more of a cramped rail than three of
  // twenty Recent rows, which is the trade this ordering is meant to make.
  it("passes over a pane whose minimum will not fit and serves a cheaper one behind it", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 3 });
    const budget = distributeRailHeight(PANES, boxes, { available: 500, gap: GAP });
    expect(budget.orgs!.demoted).toBe(false);
    expect(budget.portfolio!.demoted).toBe(false);
    expect(budget.recent!.demoted).toBe(true);
    expect(budget.recent!.height).toBeNull();
    expect(budget.recent!.hidden).toBe(20);
    expect(budget.routines!.rows).toBe(2);
    expect(spent(budget, boxes)).toBeLessThanOrEqual(500);
  });

  it("demotes rather than clips when the rail is far too short", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 3 });
    const budget = distributeRailHeight(PANES, boxes, { available: 200, gap: GAP });
    for (const { key } of PANES) expect(budget[key]!.demoted, key).toBe(true);
  });

  it("gives a pane fewer rows than its minimum when that is all it has", () => {
    const boxes = metrics({ orgs: 1, portfolio: 11, recent: 20, routines: 3 });
    const budget = distributeRailHeight(PANES, boxes, { available: 790, gap: GAP });
    expect(budget.orgs!.rows).toBe(1);
    expect(budget.orgs!.hidden).toBe(0);
  });

  it("leaves an empty pane alone: no rows, no height of ours, never demoted", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 0 });
    const budget = distributeRailHeight(PANES, boxes, { available: 790, gap: GAP });
    expect(budget.routines).toEqual({ rows: 0, height: null, hidden: 0, demoted: false });
    // Its one "all 7 routines healthy" line is still charged for, so the panes
    // above it cannot spend the height it occupies.
    expect(spent(budget, boxes)).toBeLessThanOrEqual(790);
  });

  it("charges the gap between panes", () => {
    const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 3 });
    const tight = distributeRailHeight(PANES, boxes, { available: 790, gap: 0 });
    const gapped = distributeRailHeight(PANES, boxes, { available: 790, gap: 48 });
    const rows = (budget: typeof tight) => PANES.reduce((n, { key }) => n + budget[key]!.rows, 0);
    expect(rows(tight)).toBeGreaterThan(rows(gapped));
  });
});

describe("sameRailBudget", () => {
  const boxes = metrics({ orgs: 12, portfolio: 11, recent: 20, routines: 3 });

  it("holds for two runs over the same measurements", () => {
    const a = distributeRailHeight(PANES, boxes, { available: 790, gap: GAP });
    const b = distributeRailHeight(PANES, boxes, { available: 790, gap: GAP });
    expect(sameRailBudget(a, b)).toBe(true);
  });

  it("breaks when the window changed the rail", () => {
    const a = distributeRailHeight(PANES, boxes, { available: 790, gap: GAP });
    const b = distributeRailHeight(PANES, boxes, { available: 1400, gap: GAP });
    expect(sameRailBudget(a, b)).toBe(false);
  });

  it("breaks when a pane appears or goes away", () => {
    const a = distributeRailHeight(PANES, boxes, { available: 790, gap: GAP });
    const { routines: _dropped, ...fewer } = a;
    expect(sameRailBudget(a, fewer)).toBe(false);
  });
});
