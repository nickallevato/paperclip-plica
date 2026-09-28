/**
 * The left rail's height budget.
 *
 * The rail used to be four cards in a column, each with its own pixel scroll
 * cap — 256px of Recent, 160px of Routines, and nothing at all on Orgs. Two
 * consequences, both visible on the board: watching another org pushed every
 * pane below Orgs down the page until Portfolio was off the bottom of the
 * screen, and a 27-inch monitor got exactly the same 160px of Routines as a
 * 13-inch laptop. Height that existed was not spent; height that did not exist
 * was spent anyway.
 *
 * So the rail is told how tall it is and spends it. Each pane declares the
 * fewest rows worth drawing and the most rows worth keeping, plus a priority.
 * Everyone who can afford its minimum gets it, then the surplus goes out one
 * row at a time in priority order, round-robin, so the pane that most wants
 * height gets it first and nothing starves. A pane that cannot afford its
 * minimum demotes to its header rather than being clipped, and a pane holding
 * rows back says how many.
 *
 * Every height here is measured from the page ({@link useRailBudget}) rather
 * than assumed: a row's height depends on the theme's line height and on the
 * density setting, and a constant that drifts from it is precisely how the old
 * rail ended up drawing a row sliced through the middle.
 */

export interface TicklerRailPaneSpec {
  /** Matches `data-rail-pane` on the pane's own element. */
  key: string;
  /** Below this the pane is not worth drawing at all, and it demotes. */
  minRows: number;
  /** Past this, height is better spent on another pane. `Infinity` = all of them. */
  idealRows: number;
  /** Lower goes first, both for minimums and for the surplus. */
  priority: number;
}

/** One pane, as the page actually drew it. */
export interface TicklerRailPaneMetrics {
  /** The header. Always drawn, and the whole of a demoted pane. */
  head: number;
  /** Everything else that is not a row: a legend, an "N more" line, an empty note. */
  foot: number;
  /** One row. Zero when the pane has no rows to measure. */
  row: number;
  /** The pane's own border and padding, which its height has to carry too. */
  frame: number;
  /** Rows the pane has to show, whether or not they fit. */
  total: number;
}

export interface TicklerRailPaneBudget {
  /** Rows the pane may draw. Zero means demoted, or that it has none. */
  rows: number;
  /** Pixels to pin the pane to, or null to let it size itself. */
  height: number | null;
  /** Rows it is holding back, for the header to own up to. */
  hidden: number;
  /** Header only: the pane could not afford even its minimum. */
  demoted: boolean;
}

export type TicklerRailBudget = Record<string, TicklerRailPaneBudget | undefined>;

/** A pane left to size itself, which is every pane until the rail is measured. */
const UNBUDGETED: TicklerRailPaneBudget = { rows: 0, height: null, hidden: 0, demoted: false };

/** Every pane sizing itself — the pre-measurement state, and the narrow layout. */
export function unbudgeted(specs: readonly TicklerRailPaneSpec[]): TicklerRailBudget {
  return Object.fromEntries(specs.map((spec) => [spec.key, UNBUDGETED]));
}

/**
 * Enough of a pane measured to reason about it: a header, and a row height if
 * it has rows. A pane that has not been measured yet takes the whole rail out
 * of the budget rather than being guessed at — a bad guess here moves panes
 * around on the reader after first paint, which is worse than one frame of the
 * heights the panes give themselves.
 */
function measured(metrics: TicklerRailPaneMetrics | undefined): metrics is TicklerRailPaneMetrics {
  if (!metrics || metrics.head <= 0) return false;
  return metrics.total === 0 || metrics.row > 0;
}

/**
 * Hand out `available` pixels of rail to `specs`.
 *
 * `gap` is the space between two panes; it is charged once per join, so the
 * budget is the rail's inner height minus the gaps it must draw.
 */
export function distributeRailHeight(
  specs: readonly TicklerRailPaneSpec[],
  metrics: Record<string, TicklerRailPaneMetrics | undefined>,
  { available, gap }: { available: number; gap: number },
): TicklerRailBudget {
  const panes = specs.map((spec) => ({ spec, box: metrics[spec.key] }));
  if (available <= 0 || !panes.every(({ box }) => measured(box))) return unbudgeted(specs);
  const boxes = metrics as Record<string, TicklerRailPaneMetrics>;

  // An empty pane is not a demoted one: "all 7 routines healthy" is the answer,
  // not a pane that has been squeezed out. It is never promoted and never
  // clipped, and it costs whatever its one line costs.
  const empty = (key: string) => boxes[key].total === 0;
  const ideal = (spec: TicklerRailPaneSpec) => Math.min(spec.idealRows, boxes[spec.key].total);
  const floor = (spec: TicklerRailPaneSpec) => Math.min(spec.minRows, boxes[spec.key].total);

  const rows: Record<string, number> = Object.fromEntries(specs.map((spec) => [spec.key, 0]));
  const paneHeight = (key: string) => {
    const box = boxes[key];
    const drawn = rows[key] > 0 || empty(key);
    return box.frame + box.head + (drawn ? box.foot : 0) + rows[key] * box.row;
  };
  const spent = () =>
    specs.reduce((total, spec) => total + paneHeight(spec.key), 0) + gap * Math.max(0, specs.length - 1);
  /** Take `n` rows if the rail can still pay for every pane; otherwise change nothing. */
  const afford = (key: string, n: number) => {
    const held = rows[key];
    rows[key] = n;
    if (spent() <= available) return true;
    rows[key] = held;
    return false;
  };

  const order = [...specs].sort((a, b) => a.priority - b.priority);
  for (const spec of order) {
    if (empty(spec.key)) continue;
    afford(spec.key, floor(spec));
  }
  // The surplus, one row at a time, cycling the panes in priority order and
  // skipping any already at its ideal. Orgs is cheap and first, so it is whole
  // before Portfolio takes its fourth row; on a tall screen every pane grows
  // together instead of one pane eating the height.
  for (let moving = true; moving; ) {
    moving = false;
    for (const spec of order) {
      if (rows[spec.key] === 0 || rows[spec.key] >= ideal(spec)) continue;
      if (afford(spec.key, rows[spec.key] + 1)) moving = true;
    }
  }

  return Object.fromEntries(
    specs.map((spec) => {
      const box = boxes[spec.key];
      const drawn = rows[spec.key];
      if (empty(spec.key)) return [spec.key, UNBUDGETED];
      if (drawn === 0) return [spec.key, { rows: 0, height: null, hidden: box.total, demoted: true }];
      return [
        spec.key,
        {
          rows: drawn,
          // Header plus a whole number of rows, always: this is what keeps a
          // pane from ending in a row cut in half.
          height: paneHeight(spec.key),
          hidden: Math.max(0, box.total - drawn),
          demoted: false,
        },
      ];
    }),
  );
}

/** Two budgets that would draw the same rail, so the hook can skip a re-render. */
export function sameRailBudget(a: TicklerRailBudget, b: TicklerRailBudget): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (!left || !right) return left === right;
    if (
      left.rows !== right.rows ||
      left.height !== right.height ||
      left.hidden !== right.hidden ||
      left.demoted !== right.demoted
    )
      return false;
  }
  return true;
}
