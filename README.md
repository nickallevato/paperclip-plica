# Plica

A cross-company HUD for [Paperclip](https://github.com/paperclipai/paperclip). One page that
answers "what needs me, across every company, right now" — instead of visiting each company's
dashboard in turn.

Plica is UI-only. It contributes one page (mounted at `/:companyPrefix/plica`) and a sidebar
launcher that navigates there. Its worker is a deliberate no-op.

## What it shows

**Board** (default) — one row per company: capacity, live runs, what is waiting on you, token
burn, and a sparkline of recent activity. Rows can be pinned, sorted by heat, and clicked to
filter the queue below.

**Queue** — every item across every company that wants a human, in one list: approvals,
interactions awaiting a response, and routine exceptions. Actions are inline; you rarely need
to open the company.

**Briefing** — what changed since your last visit.

A classic layout is available behind a toggle; the board is the default.

## Install

Plica installs from a local path — it is not published to a registry.

```bash
git clone https://github.com/nickallevato/paperclip-plica.git
cd paperclip-plica
pnpm install
pnpm build
```

Then register it with your Paperclip instance:

```bash
npx paperclipai plugin install /absolute/path/to/paperclip-plica --local
```

Paperclip watches the installed package's `dist` output, so leaving `pnpm dev` running here
reloads the plugin in place.

The `@paperclipai/shared` and `@paperclipai/plugin-sdk` dev dependencies are `link:` references
to a Paperclip checkout at `~/paperclip`. Plica type-checks against **that** checkout, which is
how it stays honest about upstream API changes. If your checkout lives elsewhere, repoint the
two `link:` paths in `package.json`.

## The stylesheet coupling

**Rebuilding Paperclip's UI requires rebuilding Plica.** This is the one operational rule worth
knowing, and nothing enforces it.

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

Ordering cannot fix this, in either direction. Appended last, Plica's duplicates beat the host's
responsive variants. Inserted first, Plica's `@layer` declarations come before the host's, which
pushes the host's `base`/`components` layers after `utilities` and breaks spacing app-wide.
Subtraction is the only approach that works.

## Vendored host components

`src/ui/host/` holds read-only copies of Paperclip internals Plica depends on — the ui-kit
primitives, `useCompanyOrder`, API client shapes. They are copies rather than imports because
Paperclip does not export them to plugins.

Keep them byte-identical to their upstream originals apart from import paths. Two deliberate
exceptions, both documented in the files themselves:

- `ui-kit/dialog.tsx` — plain Tailwind positioning, since the host's version leans on theme-only
  CSS variables the plugin sheet does not carry.
- `useCompanyOrder.ts` — read path only; the host's mutation and `persistOrder` are omitted
  because Plica never reorders.

Anything else that drifts is a bug. `CompanyPatternIcon.tsx` in particular must match exactly:
Paperclip draws company avatars with its own copy, so any change here gives one company two
different identities on screen.

## Development

```bash
pnpm dev         # esbuild watch + CSS rebuild
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm build       # CSS then bundle
pnpm hooks:install   # pre-commit: typecheck + test
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
    PlicaToolbarButton.tsx sidebar launcher
    components/            board rows, queue, portfolio, briefing, strips
    lib/                   capacity, queue grouping, run derivation, drafts
    host/                  vendored Paperclip internals (read-only)
    styles.ts              injects the compiled sheet, idempotently
scripts/build-css.mjs      Tailwind compile + host-duplicate subtraction
```

## License

MIT
