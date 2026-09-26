# Changelog

Short-form. The reader-facing write-up for each version is in
[`docs/releases/`](docs/releases/).

## Unreleased

- **"Recent" replaces the live strip.** The full-width row of pills across the
  top of the page is gone; the left column now carries **Recent** — one line per
  task, live ones first and newest first, with the same pulsing dot on the rows
  an agent is on right now and the task's own status glyph on the rest. A row is
  as wide as the column, so the ticket title fits, and a task that has just
  finished stays in place instead of vanishing with its run. The list scrolls
  inside a capped height, so a run starting cannot shove Portfolio or Routines
  down the page.
- **Fixed: the board no longer overflows the viewport at phone width.** Recent's
  rows were as wide as their untruncated ticket titles, which widened the
  single-column grid past the window and clipped every pane in it on the right —
  Orgs lost its runs/day and Need-you figures, and its header lost `need you`.
  Every panel now has a floor of zero width, so the column is the window again
  and the titles truncate.
- **Fixed: a "Stylesheet stale" badge that would not clear after a good `pnpm build`.**
  The build located the host stylesheet by taking the largest `index-*.css` in
  the host's assets dir, so an abandoned sheet from an earlier build — bigger
  than the live one, left behind in an unclean `dist/` — was recorded instead,
  and no number of rebuilds cleared the badge. It now reads the sheet the host's
  own `index.html` links, which is the same tag the runtime check compares
  against; falling back to the most recently modified only when there is no
  `index.html`.
- **Fixed: the build says which stylesheet it read, and what it passed over.** Warnings
  for every ambiguity it had to resolve, including a `PLICA_HOST_CSS` override
  that disagrees with the dist it overrides — a stale export in a shell profile
  used to win silently. `docs/troubleshooting.md` gains a section for the badge
  surviving a rebuild, and `docs/install.md` documents that Paperclip's UI must
  be rebuilt before Plica's.

## 0.4.0

### On a phone

- **Queue rows stay readable at phone width.** A row's actions drop to their
  own line under the title instead of crushing it to "Budget…" and the meta to
  one word per line; the Today / This week / Whenever picks come back there
  instead of hiding.

### Decide by

- **"Orgs", not "companies"**, everywhere Plica labels them: the list, the
  queue and portfolio grouping, the header ("all orgs").

- **The queue owns the page.** The wide company ledger is now a compact
  **Orgs** list in the left column — name, who is working, runs per day,
  and Need you — so the queue takes the main column. Every figure the ledger
  showed (Questions, Blocked, Review, Open, Tokens, the run sparkline, the
  lead agent) is in a card on hovering a company's name, with Watch and Open.
  Narrow, the page stacks Orgs, the queue, then Portfolio and Routines.

- **The queue is grouped by when you'll decide.** Today, Unsorted, This week,
  Alerts, Whenever and Snoozed replace Now / Soon / Later as the default
  grouping (Severity is still one click away). The lanes come from Paperclip's
  own decision triage, so a day set in Plica is the day Paperclip's Decisions
  page shows.
- **Unsorted rows sort in one click**: Today · This week · Whenever sit inline.
- **Every row has a triage menu**: decide by, snooze (1 hour to a week), wake,
  archive. Changes apply immediately and are rolled back with a toast if
  Paperclip refuses them.
- **Snoozed items are away.** They sit folded in the Snoozed lane and nowhere
  else, and they no longer count toward the Needs you badge.
- The header reads *N today (N overdue) · N unsorted · N snoozed*.
- The demo fixture now carries realistic triage (it used to store an instant
  where Paperclip stores a preset or a date), and demo mode accepts the triage
  and archive writes.

### A calmer board

- **Colour marks one thing per row.** The ledger's Questions, Blocked and
  Review counts are plain ink now; only **Need you** carries ochre or brick.
  Every nonzero count used to be ochre, so one question read as loudly as five
  things waiting on you.
- **Critical rows in Now carry an edge, not a band.** A faint tint and a brick
  edge replace the solid pink (maroon in dark mode) fill.
- **Moving work and good runs are sage, not neon.** Portfolio bars, the
  sparkline and answered cards use Plica's new low-chroma `ok` colour.
- **Liveness is Paperclip's own blue**, the same one its nav dots and
  in-progress icons use.
- **The ledger no longer clips its last column.** The totals row was padded
  wider than the rows above it, which pushed the pin and open icons out of the
  card. The sparkline now hides when the ledger is narrow rather than when the
  window is, and the board stacks (ledger and queue first) when there isn't
  room for both columns.
- **One toggle style.** Hot first / My order, Trouble / Company and the queue
  grouping all draw like Paperclip's tabs.
- "Expected every every 1h" on an overdue heartbeat now reads "expected every 1h".

### Paperclip v2026.916.0

- **In-progress tasks draw Paperclip's new spinner glyph.** The host replaced the
  rotate arrow with an open circle that turns (and holds still under reduced
  motion);
  Plica's copy of the glyph had fallen behind, so the same task looked
  different in Plica and in Paperclip.
- **Links into `/tasks` and `/chats` keep their company.** Both are new
  company-scoped routes; Plica did not know them, so a link into one could lose
  its company prefix.
- **Dialogs respect reduced motion**, as Paperclip's now do.
- **`pnpm check:vendored`** reports any vendored host file that has drifted from
  the Paperclip checkout. Nothing caught the two above until now.

### The mark

- **Plica has its own icon.** A sheet folded down its middle, seen end-on — a
  *plica*, which reads flat as a caret. It replaces the two stock Lucide icons
  that stood in for it: the Telescope on the breadcrumb-bar button and the
  Layers glyph beside the page title. Both surfaces now show the same mark, so
  the button in the host's chrome and the page it opens are recognisably the
  same thing.
- Drawn as an SVG component rather than shipped as the supplied PNG, so it
  inherits `currentColor` and tracks the text beside it through hover, light
  mode and dark mode. The source artwork and its geometry are kept in
  [`docs/brand/`](docs/brand/) for anyone who has to redraw it.

### The stylesheet coupling

- **Plica now warns when it needs rebuilding after a Paperclip upgrade.** Plica
  filters its own utilities against Paperclip's compiled stylesheet once, at
  build time; upgrade Paperclip and that filtering goes stale, and Plica's
  leftover duplicates can override Paperclip's responsive rules and strand the
  whole application in its mobile layout. The symptom shows up in Paperclip's
  own chrome with nothing pointing at Plica, and the fix — `pnpm build` in the
  Plica checkout — is not one anyone would guess. A **Stylesheet stale** badge
  now appears in the Plica header, and its hover text names the fix and shows
  the stylesheet Plica was built against next to the one currently loaded.
- **It stays quiet unless it is sure.** If the host's stylesheet cannot be
  identified from the page, Plica shows nothing rather than a warning it cannot
  stand behind. Nothing about rendering, data or demo mode changes either way.

### Documentation

- **A documentation set with real screenshots**, in [`docs/`](docs/): install,
  configuration, the board, the queue, and troubleshooting. The README is now an
  overview that hands off to them rather than the only page there is.
- Screenshots are **generated**, by `scripts/capture-screenshots.mjs`, from a
  running instance in demo mode. Refreshing them after a UI change is one
  command instead of a manual session with a cropping tool, which is the only
  version of "keep the screenshots current" that survives contact with a
  release. See [`docs/screenshots/README.md`](docs/screenshots/README.md).
- Removed the README's claim that a classic layout is available behind a toggle.
  The classic views were retired in `e40e459`; the line documented a feature
  that does not exist.
- `demoDataUrl` is now documented as accepted-and-ignored on the settings page.
  It is declared in the manifest and rendered by the host, but nothing reads it.
- Corrected two `PLUGIN_SPEC.md §24` citations in `src/manifest.ts` and
  `src/ui/host/api.ts`. §24 is *Operator UX*; the statement they lean on is in
  the spec's *Current implementation caveats*.
- Marked the plugin-migration plan as completed and corrected its description of
  what shipped — a `globalToolbarButton` slot, not a navigate launcher in the
  sidebar zone.

## 0.3.0

### Demo mode

- **Plica can now serve the whole HUD from a bundled fixture instead of the
  live instance**, so the page can be shown or screenshotted without exposing
  real company names, ticket titles or agent narration. Four invented companies
  with ~40 tickets, ~22 agents, live runs, an overdue routine and a company in
  the red — sized so every surface has something to draw rather than reading as
  an empty prototype.
- Two switches: `?demo=1` on the URL (sticky for the browser session, and
  superseded as soon as the setting is changed) and a **Demo mode** checkbox
  on the host's plugin settings page,
  which Paperclip renders from the new `instanceConfigSchema` in the manifest.
  Host plugin config is company-scoped and Plica is not, so the box ticked for
  any one company turns the whole page into a demo.
- The substitution happens at one seam — `request()` in `src/ui/host/api.ts` —
  which every read Plica performs already funnels through. No component knows
  demo mode exists, and none can leak real data by forgetting about it. Writes
  are intercepted too, so approving an approval or answering an interaction
  works in a walkthrough without reaching the server.
- Fails closed. The page renders a placeholder until the mode is resolved and
  an error if the fixture cannot be loaded, rather than showing real data for a
  frame or falling back to it silently. A **Demo data** badge sits in the
  header the whole time it is on.
- Addressed by the plugin's row UUID, looked up from `/api/plugins`. The
  plugin-**key** form of the asset route 500s: its `getById` guard reads
  `error.code` while drizzle puts the Postgres `22P02` on `error.cause`, so a
  non-UUID id escapes the guard instead of falling through to `getByKey`.
- The fixture is a real file at `dist/ui/demo-data.json`, so renaming a company
  is an edit and a reload. Structural changes go through
  `scripts/gen-demo-data.mjs` (`pnpm demo:data`); a test asserts the two agree.
  Timestamps are relative tokens resolved at page load, so the demo never reads
  as months stale.

### Layout

- **Live now moved out of the rail and onto a strip across the top of the
  board.** It was the one block whose height tracked the size of the fleet, so
  every run that started or finished shoved the lists below it down the page.
  As a single row of pills its height cannot change at all, and nothing below
  it ever moves. Running agents are a glance, not a list you work through.
- Each run is now a pill: company, ticket, agent, elapsed. The title and the
  agent's narration moved into the hover, where they cannot wrap a pill onto a
  second line and change the strip's height.
- No cap and no "+N more" line — the row scrolls sideways, so the header count
  and what you can reach always agree.
- The rail is a sticky column **capped** at the viewport rather than pinned to
  a fixed height. The fixed height had to guess how much chrome sat above it
  and guessed high, which pushed Routines off the bottom of the screen.
  Routines is now `shrink-0`: it is the one thing that can never be squeezed
  out of view, and Portfolio scrolls inside itself only once the column would
  otherwise overflow.

### Portfolio (was Projects)

- The projects rail is now a chart, not a list. The folds, the company
  grouping, the `most open` / `least open` sort and the per-project deep links
  are gone — what people actually read off that rail was the shape of the bars,
  and the rows were not being clicked.
- One bar per project across every company, **scaled to the largest project**
  so lengths compare down the column rather than only within a row. Three
  segments now: moving, **waiting**, blocked — waiting is the untouched
  remainder the old two-segment bar left as bare track and therefore never
  named.
- Ordered worst-first (latest overdue → most stuck → biggest), not by deadline.
  A chart read at a glance must put the worst bar under the eye first.
- **Trouble / By company** toggle in the header, persisted in
  `plica.portfolioSort`. Company order follows the board's own — watched first,
  then hot-first or the sidebar order — so a company sits in the same place in
  both panes, and the worst project still leads inside each company. Gathering
  the bars is the only way to see that one company's whole portfolio is stuck,
  which trouble-order scatters down the column.
- In company order each block is headed by the company's name and its own
  open / blocked / late figures. The header is **sticky**, because a block can
  be taller than the pane and scrolling past the name would leave a run of bars
  with nothing saying whose they are. The per-row company icon drops away in
  that mode — the header already answers it — and stays in Trouble order, where
  consecutive bars have no shared owner to head.
- `plica.projectGrouping` and `plica.projectSort` retired; both are cleared on
  load with the other legacy keys.

### Routines

- Replaced the week's timetable with **exceptions only**: failed, wedged on a
  blocked issue, or overdue. A schedule you can predict is not information —
  the old list spent its whole height saying twenty routines would fire on
  time and gave the two that broke the same weight as the rest.
- Healthy routines are a count in the footer. When everything is healthy the
  block is one reassuring line; with no routines at all it says so distinctly.
- A routine that both failed and ran late is one problem, filed under the
  failure, which is the half that says why.

### Needs you

- Age filter chips in the rail header: **All / Today / Yesterday / Last week /
  Old**, persisted in `plica.queueAgeFilter`. A rail carrying a hundred-odd
  items is a wall you stop reading, and the oldest things on it are the least
  likely to still matter.
- Buckets are **calendar days cut at local midnight**, not rolling hours — an
  item raised at 9pm last night is yesterday's at 8am today. The Age *grouping*
  now uses the same buckets, so the two can never disagree about which pile an
  item is in.
- Each chip carries the count of the **unfiltered** queue, so an empty bucket
  is distinguishable from a hidden one. Empty buckets stay visible but disabled
  rather than disappearing, so the chips never move under the cursor as items
  age past midnight.
- Under an age filter, **Later starts open**: narrowing to "Old" is an explicit
  request for that slice, and a rail whose only match is folded away reads as
  empty.
- The rail's badge and "oldest" now describe what is on screen, not the queue
  behind the filter.
- Age sort remains a toggle in the rail header (`oldest` / `newest`), persisted
  in `plica.queueSort`. Severity still decides the order first — the toggle only
  flips which of two equally urgent items leads, so grouping by Severity with
  newest first works as one view.
- Every group in the rail folds from its header, not just Later.

### Internal

- `PlicaListControls` factored out of the queue's own header. `PlicaFoldGroup`
  and `PlicaCompanyGroup` are gone with the rail they served — the Portfolio
  chart and the routine exceptions have nothing to fold.
- The projects rail's grouping and sorting helpers (`groupProjects`,
  `compareProjectEntries`, `projectDueBucket`, `projectHealth`) removed with it;
  a chart ordered worst-first has nothing left for them to choose between.
- Test timezone pinned to UTC. The queue's age buckets cut at *local* midnight
  by design, so the suite has to agree on which local.

### Project

- **Requests have one path now**, written down in `docs/intake.md`: capture,
  deduplicate, clarify, scope, propose a priority, build, review, merge,
  changelog. Two steps are the repository owner's — the priority band and the
  merge — and the document says so rather than leaving it to be discovered.
- Three issue templates (feature request, bug report, core limitation) produce
  the *Problem / Proposed scope / Acceptance criteria / Open questions* shape
  triage needs, so triage fills gaps instead of restructuring prose. Blank
  issues stay enabled on purpose.
- The **core limitation** template is the sanctioned exit from the
  no-core-changes rule and the only one: it asks which extension point comes
  closest, why it falls short, and what Plica ships in the meantime — then parks
  the work for the owner rather than routing around core.
- A state label is now mandatory on every issue, because an issue with no state
  label is the one failure mode nothing else in this repository has an alarm on.

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
