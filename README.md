# Plica

A cross-org HUD for [Paperclip](https://github.com/paperclipai/paperclip). One page that
answers "what needs me, across every org, right now" — and lets you say *when* you will deal
with each thing — instead of visiting each org's dashboard in turn.

Plica is UI-only. It contributes one page (mounted at `/:companyPrefix/plica`) and a toolbar
launcher that navigates there. Its worker is a deliberate no-op.

![The Plica page: Orgs, portfolio and routines at left; the Needs-you queue, grouped by when you'll decide, owning the main column](docs/screenshots/plica-page.png)

> Every screenshot in this repository is Plica's own [demo mode](docs/configuration.md#demo-mode) —
> invented orgs, tickets and agents, not a real instance. Try it on your own install: add
> `?demo=1` to the Plica page's URL (e.g. `/ACME/plica?demo=1`). Nothing you click in demo mode
> reaches the server.

**Documentation:** [install](docs/install.md) · [configuration](docs/configuration.md) ·
[the board](docs/board.md) · [the queue](docs/queue.md) ·
[troubleshooting](docs/troubleshooting.md) · [release notes](docs/releases/)

## What it shows

**Queue** — the main column. Every item across every org that wants a human, in one list:
approvals, questions and confirmations awaiting a response, blockers, failed runs, overdue
heartbeats and routine exceptions. Actions are inline — Approve, Reject, Reply — so you rarely
need to open the org.

By default it groups by **when you said you'd decide**: Today (and anything overdue), Unsorted,
This week, Alerts, Whenever and Snoozed. New items land in Unsorted with **Today · This week ·
Whenever** right on the row, and every row has a menu to set a day, snooze or archive it. These
are Paperclip's own decision-triage records, so a day set in Plica is the day Paperclip's
Decisions page shows — and it works on stock Paperclip, through its existing web API.

![The queue grouped by when you'll decide: Today, Unsorted, This week](docs/screenshots/queue-by-decide.png)

It can also group by severity, org, kind, project or age — by project is how you find the one
project quietly generating half the noise.

**Orgs** — the left column: one line per org with who is working, runs per day and how much is
waiting on you. Hover a name for everything else (questions, blockers, review, open work, token
burn, a sparkline of recent runs, the lead agent). Orgs can be watched, sorted by heat, and
clicked to filter the queue.

![An org's detail card: every figure the line leaves out](docs/screenshots/company-detail.png)

Each org's capacity is a row of squares, one per agent — working, stalled, queued, errored or
idle. Hovering one says who it is and what they are actually doing, which is the thing a bare
"3 running" count cannot tell you.

![A capacity square's hover card: the agent, their ticket, and what they are doing right now](docs/screenshots/capacity-hover.png)

**Portfolio and Routines** — projects by how much is moving, waiting or blocked, and the
routines that failed or stopped firing.

**Briefing** — what changed since your last visit.

**On a phone** — the page stacks Orgs, the queue, then Portfolio and Routines, and each queue
row puts its actions on a line of their own.

<img src="docs/screenshots/phone.png" alt="Plica at phone width: the Orgs list above the queue" width="320">

Full tours: [the board](docs/board.md), [the queue](docs/queue.md).

## Install

Plica installs from a local path — it is not published to a registry.

```bash
git clone https://github.com/nickallevato/paperclip-plica.git
cd paperclip-plica
pnpm install
pnpm build
npx paperclipai plugin install /absolute/path/to/paperclip-plica --local
```

That is the short version. [docs/install.md](docs/install.md) covers the required directory
layout for the `link:` dependencies, what to do after a Paperclip upgrade, and how to check it
actually loaded.

## Demo mode

Plica can serve the whole HUD from a bundled fixture instead of your instance, so the page can
be screenshotted or demoed without putting real company names, ticket titles or agent chatter
on screen. Turn it on with `?demo=1` or the **Demo mode** checkbox on the plugin's settings
page; the header carries a **DEMO DATA** badge the whole time it is on. It fails closed — a
fixture that will not load is an error, never a silent fall back to real data.

Details, including how to edit the fixture:
[docs/configuration.md](docs/configuration.md#demo-mode).

The screenshots in `docs/screenshots/` are demo mode with nothing else done to them, captured by
`scripts/capture-screenshots.mjs`. See [docs/screenshots/README.md](docs/screenshots/README.md).

## The stylesheet coupling

**Rebuilding Paperclip's UI requires rebuilding Plica.** This is the one operational rule worth
knowing. Plica now notices when it has been broken and says so — see "The staleness warning"
below — but noticing is all it does; the rebuild is still yours to run.

Plica compiles its own Tailwind sheet and injects it via `<style>` appended to `<head>` — after
the host's. Tailwind emits every class it scans, including ones Paperclip already defines, and a
duplicate that lands later wins on document order. A stray `.hidden{display:none}` is enough to
beat Paperclip's `@media(min-width:40rem){.sm\:flex{...}}` and pin the whole app in its mobile
layout.

`scripts/build-css.mjs` fixes this by subtracting every selector the host stylesheet already
ships (it refuses to emit an unfiltered sheet at all). But the subtraction is computed **once, at
build time**, against whichever `~/paperclip/ui/dist/assets/index-*.css` exists then. Upgrade
Paperclip and that file is rebuilt under a new hash — the subtraction is now stale, and classes
the new host defines are no longer filtered out.

So: after any Paperclip upgrade, run `pnpm build` here. Override the host sheet location with
`PLICA_HOST_CSS` if needed.

Which sheet gets subtracted is decided by `scripts/host-css.mjs`, and it asks the host's own
`~/paperclip/ui/dist/index.html` — the `<link rel="stylesheet">` Vite wrote there names the entry
sheet it emitted, and it is the same tag the runtime check reads at mount, so both halves of the
comparison agree by construction. Only when there is no `index.html` to ask does it guess from the
directory listing, and then it takes the most recently modified sheet and says out loud that it
guessed. Reading the listing alone is not enough: an abandoned `index-*.css` from an earlier build
is a normal thing to find in an unclean `dist/`, and picking it records a sheet the page will never
serve, so the badge never clears no matter how many times you rebuild.

Ordering cannot fix this, in either direction. Appended last, Plica's duplicates beat the host's
responsive variants. Inserted first, Plica's `@layer` declarations come before the host's, which
pushes the host's `base`/`components` layers after `utilities` and breaks spacing app-wide.
Subtraction is the only approach that works.

### The staleness warning

The reason that rule needed writing down is that breaking it looks like nothing to do with Plica:
the symptom is Paperclip's own sidebar and chrome stranded in the mobile layout, and the person
who upgraded has no reason to suspect a plugin they installed weeks ago.

So Plica records what it subtracted against and checks it at runtime. `scripts/build-css.mjs`
writes the host sheet's filename and a content hash to `src/ui/host-css.generated.json`, esbuild
inlines that into the UI bundle, and at mount Plica compares it against the stylesheet the
document actually loaded — read from the `<link>` tags, using nothing but the DOM. On a mismatch
the Plica header carries a **Stylesheet stale** badge beside `Demo data`, whose hover text names
the fix (`pnpm build`) and shows both identifiers, recorded and observed. The same text is repeated
in an `sr-only` span, because assistive technology cannot hover.

![The Plica header with a "Stylesheet stale" badge beside the title, its hover text naming pnpm build
and showing the stylesheet Plica was built against next to the one now being served](docs/screenshots/stale-stylesheet-warning.png)

**It fails open.** If the host's stylesheet cannot be identified — no same-origin stylesheet link,
several that are equally plausible, or a bundle built with no record at all — Plica shows nothing
rather than a warning it cannot stand behind. A false "your plugin is stale" on every load teaches
people to ignore the badge that matters.

The filename is what gets compared, not the content hash. Paperclip's sheet is Vite-built and
hash-named, so the name already changes whenever the bytes do, and reading a name off a `<link>`
costs nothing — where an observed content hash would mean fetching and hashing ~450KB of CSS on
every page load. The recorded hash is kept for the badge to display and for comparing two installs
by hand. The gap that leaves: a host serving an *unhashed* stylesheet name could be rebuilt under
the same name with the check staying quiet. That is the fail-open direction, and deliberate.

To see the badge: point `PLICA_HOST_CSS` at a different sheet, `pnpm build`, and load the page.

## Vendored host components

`src/ui/host/` holds read-only copies of Paperclip internals Plica depends on — the ui-kit
primitives, `useCompanyOrder`, API client shapes. They are copies rather than imports because
Paperclip does not export them to plugins.

Keep them byte-identical to their upstream originals apart from import paths. Three documented
exceptions:

- `ui-kit/dialog.tsx` — plain Tailwind positioning, since the host's version leans on theme-only
  CSS variables the plugin sheet does not carry.
- `useCompanyOrder.ts` — read path only; the host's mutation and `persistOrder` are omitted
  because Plica never reorders.
- `ui-kit/hover-card.tsx` — a Plica original, not a copy. The host ships no HoverCard component,
  so there is nothing upstream to keep it identical to.

Anything else that drifts is a bug. `CompanyPatternIcon.tsx` in particular must match exactly:
Paperclip draws company avatars with its own copy, so any change here gives one company two
different identities on screen.

`pnpm check:vendored` compares every whole-file copy (and the route-root sets in `util.ts`)
against the Paperclip checkout, ignoring imports. Run it after each Paperclip upgrade, beside
`pnpm build`; `--diff` prints what moved.

## Development

```bash
pnpm dev             # esbuild watch + CSS rebuild
pnpm test            # vitest — needs a prior `pnpm build` on a fresh clone
pnpm typecheck       # tsc --noEmit
pnpm build           # CSS then bundle
pnpm check:surface   # the no-core-changes guardrail
pnpm hooks:install   # pre-commit: surface check, typecheck, test
```

Tests run in jsdom, which implements neither `HTMLCanvasElement.getContext` nor navigation. Both
log "Not implemented" errors during a passing run. That output is expected noise, not failure —
check the summary line.

## Layout

```
src/
  manifest.ts              plugin id, capabilities, entrypoints
  worker.ts                no-op
  ui/
    PlicaHud.tsx           root: owns the roster, sort mode, pins, token settings
    PlicaPage.tsx          host-mounted page slot
    PlicaToolbarButton.tsx toolbar launcher
    components/            company lines, queue, recent tasks, portfolio, briefing
    lib/                   capacity, queue grouping, run derivation, drafts
    host/                  vendored Paperclip internals (read-only)
    styles.ts              injects the compiled sheet, idempotently
scripts/
  build-css.mjs            Tailwind compile + host-duplicate subtraction
  capture-screenshots.mjs  the images in docs/, from a running instance
  gen-demo-data.mjs        the demo fixture
  check-plugin-surface.mjs the no-core-changes guardrail
docs/                      the documentation set
```

## Reporting a bug, or asking for a feature

Open an issue from one of the three templates — feature request, bug report, or
core limitation. [docs/intake.md](docs/intake.md) is the whole path a request
takes from there to a merged change, including the two points where the
repository owner decides: the priority band, and the merge.

You will get an answer either way. A request that turns out to be a duplicate is
closed pointing at the original and its evidence is moved there first; one that
is real but not now is *parked*, not closed, and reopens on a sentence.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). The rule to read before anything else:
**Plica never modifies Paperclip core.** Everything lands here, through a plugin
extension point. If the plugin surface cannot express a change, file it as a
core limitation rather than working around it — CI enforces this, with no bypass.

## License

MIT
