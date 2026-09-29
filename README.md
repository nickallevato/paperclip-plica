<p align="center">
  <img src="https://raw.githubusercontent.com/nickallevato/paperclip-tickler/main/docs/brand/tickler-icon.png" width="96" height="96" alt="Tickler">
</p>

<h1 align="center">Tickler</h1>

<p align="center">
  <strong>Every org. One page. What needs you, right now.</strong><br>
  A cross-org HUD for <a href="https://github.com/paperclipai/paperclip">Paperclip</a>.
</p>

<p align="center"><sub>Formerly <b>Plica</b> (<code>paperclip-plugin-plica</code>, through 0.6.0).</sub></p>

<p align="center">
  <a href="https://www.npmjs.com/package/paperclip-plugin-tickler"><img src="https://img.shields.io/npm/v/paperclip-plugin-tickler?logo=npm&color=cb3837" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/paperclip-plugin-tickler"><img src="https://img.shields.io/npm/dm/paperclip-plugin-tickler?color=cb3837" alt="npm downloads"></a>
  <a href="https://github.com/nickallevato/paperclip-tickler/actions/workflows/ci.yml"><img src="https://github.com/nickallevato/paperclip-tickler/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/paperclipai/paperclip"><img src="https://img.shields.io/badge/Paperclip-plugin-18181b" alt="Paperclip plugin"></a>
  <a href="https://github.com/nickallevato/paperclip-tickler/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

> ### 📦 Install from inside Paperclip — no terminal needed
>
> **Settings → Plugins → Install Plugin**, enter **`paperclip-plugin-tickler`** as the npm Package
> Name, and click **Install**. That's it — Tickler's button appears in the bar at the top of the page.
>
> Prefer the command line, or building from source? See [Install](#install) below.

One page that answers "what needs me, across every org, right now" — and lets you say *when*
you will deal with each thing — instead of visiting each org's dashboard in turn.

- ⚡ **Answer in place.** Approve, reject, reply, pick an option on an agent's question — right on
  the row. Never leave the dashboard if you don't have to.
- 🗓️ **Decide by.** Say *when* you'll deal with each item — Today, This week, Whenever — and the
  queue sorts itself. It's Paperclip's own decision triage, so the dates follow you there.
- 🏢 **Every org at a glance.** Who's working, runs per day, token burn and what's waiting on
  you, one line per org.
- 👀 **What agents are actually doing.** Hover any agent or task for its live narration — not
  just "3 running".
- 🚦 **Trouble surfaces itself.** Blocked projects, stalled runs, failed routines, overdue
  heartbeats.
- 📱 **Works on a phone.** The whole page stacks cleanly at phone width.
- 🎭 **Demo mode.** `?demo=1` swaps in invented orgs, so you can screenshot or demo safely.
- 🧩 **Zero core changes.** UI-only, prebuilt, and fits whichever Paperclip build it lands on.

![The Tickler page: Orgs, Recent, portfolio and routines at left; the Needs-you queue, sorted by severity into Now, Soon and Later, owning the main column](https://raw.githubusercontent.com/nickallevato/paperclip-tickler/main/docs/screenshots/hero.png)

> The screenshots are Tickler's own [demo mode](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/configuration.md#demo-mode) —
> invented orgs, tickets and agents, not a real instance — apart from the two inline-answer shots,
> which come from Tickler's own development org. Try it on your own install: add
> `?demo=1` to the Tickler page's URL (e.g. `/ACME/tickler?demo=1`). Nothing you click in demo mode
> reaches the server.

Tickler is UI-only. It contributes one page (mounted at `/:companyPrefix/tickler`) and a toolbar
launcher that navigates there. Its worker is a deliberate no-op.

**Documentation:** [install](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/install.md) · [configuration](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/configuration.md) ·
[the board](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/board.md) · [the queue](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/queue.md) ·
[troubleshooting](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/troubleshooting.md) · [release notes](https://github.com/nickallevato/paperclip-tickler/tree/main/docs/releases/)

## What it shows

**Queue** — the main column. Every item across every org that wants a human, in one list:
approvals, questions and confirmations awaiting a response, blockers, failed runs, overdue
heartbeats and routine exceptions. Actions are inline — Approve, Reject, Reply, answer a
question, choose on a confirmation — so you rarely need to leave the page, let alone open the org.

![A confirmation answered from the queue row: Yes, run it now / No, wait for the morning tick](https://raw.githubusercontent.com/nickallevato/paperclip-tickler/main/docs/screenshots/queue-confirmation.png)

<img src="https://raw.githubusercontent.com/nickallevato/paperclip-tickler/main/docs/screenshots/queue-question.png" alt="An agent's multiple-choice question answered in place, with an optional note" width="400">

By default it groups by **when you said you'd decide**: Today (and anything overdue), Unsorted,
This week, Alerts, Whenever and Snoozed. New items land in Unsorted with **Today · This week ·
Whenever** right on the row, and every row has a menu to set a day, snooze or archive it. These
are Paperclip's own decision-triage records, so a day set in Tickler is the day Paperclip's
Decisions page shows — and it works on stock Paperclip, through its existing web API.

![The queue grouped by when you'll decide: Today, Unsorted, This week](https://raw.githubusercontent.com/nickallevato/paperclip-tickler/main/docs/screenshots/queue-by-decide.png)

It can also group by severity, org, kind, project or age — by project is how you find the one
project quietly generating half the noise.

**Orgs** — the left column: one line per org with who is working, runs per day and how much is
waiting on you. Hover a name for everything else (questions, blockers, review, open work, token
burn, a sparkline of recent runs, the lead agent). Orgs can be watched, sorted by heat, and
clicked to filter the queue.

![An org's detail card: every figure the line leaves out](https://raw.githubusercontent.com/nickallevato/paperclip-tickler/main/docs/screenshots/company-detail.png)

Each org's capacity is a row of squares, one per agent — working, stalled, queued, errored or
idle. Hovering one says who it is and what they are actually doing, which is the thing a bare
"3 running" count cannot tell you.

![A capacity square's hover card: the agent, their ticket, and what they are doing right now](https://raw.githubusercontent.com/nickallevato/paperclip-tickler/main/docs/screenshots/capacity-hover.png)

**Portfolio and Routines** — projects by how much is moving, waiting or blocked, and the
routines that failed or stopped firing.

**Briefing** — what changed since your last visit.

**On a phone** — the page stacks Orgs, the queue, then Portfolio and Routines, and each queue
row puts its actions on a line of their own.

<img src="https://raw.githubusercontent.com/nickallevato/paperclip-tickler/main/docs/screenshots/phone.png" alt="Tickler at phone width: the Orgs list above the queue" width="320">

Full tours: [the board](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/board.md), [the queue](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/queue.md).

## Install

### In Paperclip (recommended)

1. Open **Settings → Plugins** — the Plugin Manager, at `/company/settings/instance/plugins`.
2. Click **Install Plugin**.
3. Enter `paperclip-plugin-tickler` as the **npm Package Name**. Just the name — no `@`, no
   version.
4. Click **Install**.

Tickler's button appears in the breadcrumb bar at the top of the page. Click it and you're in.

You need to be an instance admin, on a self-hosted Paperclip whose server can reach npm. The
package is prebuilt and carries nothing tied to a particular Paperclip build, so upgrading
Paperclip later needs nothing from Tickler.

### Manually, from the command line

```bash
npx paperclipai plugin install paperclip-plugin-tickler
```

The CLI prints the instance it is about to install into before it does anything — check that
first line. To upgrade an npm install later (the Plugin Manager has no upgrade button):

```bash
npx paperclipai plugin upgrade nickallevato.plugin-tickler
```

### From source

For working on Tickler, install it from a clone instead:

```bash
git clone https://github.com/nickallevato/paperclip-tickler.git
cd paperclip-tickler
pnpm install
pnpm build
npx paperclipai plugin install /absolute/path/to/paperclip-tickler --local
```

[docs/install.md](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/install.md) covers every route in detail: upgrading, the directory layout a clone
needs for its `link:` dependencies, and how to check the plugin actually loaded.

## Demo mode

Tickler can serve the whole HUD from a bundled fixture instead of your instance, so the page can
be screenshotted or demoed without putting real company names, ticket titles or agent chatter
on screen. Turn it on with `?demo=1` or the **Demo mode** checkbox on the plugin's settings
page; the header carries a **DEMO DATA** badge the whole time it is on. It fails closed — a
fixture that will not load is an error, never a silent fall back to real data.

Details, including how to edit the fixture:
[docs/configuration.md](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/configuration.md#demo-mode).

The screenshots in `docs/screenshots/` are demo mode with nothing else done to them, captured by
`scripts/capture-screenshots.mjs` — apart from a few hand-captured ones, which that page lists. See [docs/screenshots/README.md](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/screenshots/README.md).

## Why Tickler subtracts the host's selectors

Tickler compiles its own Tailwind sheet and injects it via `<style>` appended to `<head>` — after
the host's. Tailwind emits every class it scans, including ones Paperclip already defines, and a
duplicate that lands later wins on document order. A stray `.hidden{display:none}` is enough to
beat Paperclip's `@media(min-width:40rem){.sm\:flex{...}}` and pin the whole app — not just the
Tickler page — in its mobile layout.

Ordering cannot fix this, in either direction. Appended last, Tickler's duplicates beat the host's
responsive variants. Inserted first, Tickler's `@layer` declarations come before the host's, which
pushes the host's `base`/`components` layers after `utilities` and breaks spacing app-wide.
Subtraction is the only approach that works.

So at injection, `src/ui/styles.ts` walks the document's other stylesheets through the CSSOM,
collects every selector they define, and deletes each of Tickler's class rules the host already
has — trimming shared selector lists and dropping `@media`/`@layer`/`@supports` groups left
empty (`src/ui/lib/host-subtract.ts`). Against Paperclip's real sheet that drops about 480
selectors; Tickler-only classes are untouched. Cross-origin sheets, which the browser will not let
a page read, are skipped — they are web-font CSS, not host utilities.

This used to be done once, at build time, against whichever Paperclip UI build was on the
builder's disk — which went stale on every Paperclip upgrade and meant rebuilding Tickler after
each one. Subtracting against the sheets the page actually loaded leaves nothing to go stale: a
Paperclip upgrade needs no Tickler rebuild, the build needs no Paperclip UI build, and one
published package fits whichever Paperclip stylesheet it lands next to.

## Vendored host components

`src/ui/host/` holds read-only copies of Paperclip internals Tickler depends on — the ui-kit
primitives, `useCompanyOrder`, API client shapes. They are copies rather than imports because
Paperclip does not export them to plugins.

Keep them byte-identical to their upstream originals apart from import paths. Three documented
exceptions:

- `ui-kit/dialog.tsx` — plain Tailwind positioning, since the host's version leans on theme-only
  CSS variables the plugin sheet does not carry.
- `useCompanyOrder.ts` — read path only; the host's mutation and `persistOrder` are omitted
  because Tickler never reorders.
- `ui-kit/hover-card.tsx` — a Tickler original, not a copy. The host ships no HoverCard component,
  so there is nothing upstream to keep it identical to.

Anything else that drifts is a bug. `CompanyPatternIcon.tsx` in particular must match exactly:
Paperclip draws company avatars with its own copy, so any change here gives one company two
different identities on screen.

`pnpm check:vendored` compares every whole-file copy (and the route-root sets in `util.ts`)
against the Paperclip checkout, ignoring imports. Run it after each Paperclip upgrade;
`--diff` prints what moved.

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
    TicklerHud.tsx           root: owns the roster, sort mode, pins, token settings
    TicklerPage.tsx          host-mounted page slot
    TicklerToolbarButton.tsx toolbar launcher
    components/            company lines, queue, recent tasks, portfolio, briefing
    lib/                   capacity, queue grouping, run derivation, drafts
    host/                  vendored Paperclip internals (read-only)
    styles.ts              injects the compiled sheet, minus host duplicates, idempotently
scripts/
  build-css.mjs            Tailwind compile (host duplicates are subtracted at runtime)
  capture-screenshots.mjs  the images in docs/, from a running instance
  gen-demo-data.mjs        the demo fixture
  check-plugin-surface.mjs the no-core-changes guardrail
docs/                      the documentation set
```

## Reporting a bug, or asking for a feature

Open an issue from one of the three templates — feature request, bug report, or
core limitation. [docs/intake.md](https://github.com/nickallevato/paperclip-tickler/blob/main/docs/intake.md) is the whole path a request
takes from there to a merged change, including the two points where the
repository owner decides: the priority band, and the merge.

You will get an answer either way. A request that turns out to be a duplicate is
closed pointing at the original and its evidence is moved there first; one that
is real but not now is *parked*, not closed, and reopens on a sentence.

## Contributing

[CONTRIBUTING.md](https://github.com/nickallevato/paperclip-tickler/blob/main/CONTRIBUTING.md). The rule to read before anything else:
**Tickler never modifies Paperclip core.** Everything lands here, through a plugin
extension point. If the plugin surface cannot express a change, file it as a
core limitation rather than working around it — CI enforces this, with no bypass.

## License

MIT
