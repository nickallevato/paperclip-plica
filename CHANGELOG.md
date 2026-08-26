# Changelog

## 0.2.0

### Board

- Rebuilt the company ledger around what is waiting on you. Columns are now
  `Need you · Questions · Blocked · Review · Open · Runs/d · Tokens`, with the
  first four counted off the attention feed so they can never disagree with
  their own total. Routines and Spend columns dropped — routines duplicate the
  rail beside the board, and dollars were the least actionable figure on the row.
- **Capacity strip** replaces the old `0 / 4` count: one square per agent, in
  org order (chief first, each manager followed by their reports), showing
  working / queued / stalled / error / idle. A run that holds a runner while
  reporting nothing for 20 minutes now reads as stalled — previously invisible.
- Agents that cannot take work (paused, terminated, pending approval) no longer
  occupy squares; drawing them as idle overstated available capacity.
- Heat is computed and used to order the board, and deliberately never drawn.
- SCADA-influenced palette: `--plica-live` / `--plica-wait` / `--plica-alarm` /
  `--plica-rest`, low-chroma, one meaning each. Company brand colour is the only
  saturated thing on the board and never encodes a value.
- Header totals removed, along with the per-company summary fan-out behind them.

### Rails

- Routines and Projects group by company, following the board's own company
  order, each foldable to a one-line summary. No more `+n more` truncation.
- Routines read in calendar order, Sunday through Saturday, and colour by where
  each sits in its cycle: warming toward live over the day before it fires, live
  for the hour it runs, then straight back to rest.
- Every routine carries an outcome mark for its last run (ok / blocked / failed /
  working / skipped) that links to the issue that stopped it.

### Fixed

- **Host navigation could wedge while Plica was open** — the URL changed and the
  view never followed. `needsBreakdown` was rebuilt on every render while sitting
  in an effect dependency array, producing a render loop that starved React
  Router 7's `startTransition`. Memoised, and every `?? []` fallback in the same
  hook replaced with shared constants to close the whole class.
- Radix modal dialogs unmounted by a queue refresh could strand
  `pointer-events: none` on `<body>`, disabling every click in the app.

### Performance

- Polls paced per dataset (5s live, 15s approvals, 30s agents, 60s issues and
  projects) instead of everything at 5s, and none refetch in a hidden tab. The
  issue list — the heaviest payload on the page — was being refetched twelve
  times a minute per company.
- Dropped the sidebar-badges query entirely; nothing had rendered it since the
  Inbox column came out.

### Removed

- The CEO nudge. An overdue heartbeat now offers "Open CEO" instead.

## 0.1.0

Initial release.
