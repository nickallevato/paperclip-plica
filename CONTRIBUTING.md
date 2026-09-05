# Contributing to Plica

Plica is a Paperclip plugin. Everything below follows from that one fact.

## Never modify Paperclip core

**Plica never changes the Paperclip AI core application. Every change lands in
this repository, through a documented plugin extension point.**

Not by patching a core package. Not by committing a Paperclip checkout here.
Not by a build step that writes into `~/paperclip`. Not by a postinstall script
that rewrites something under `node_modules`. Not "temporarily", not "just to
unblock the demo".

### Why

Plica is installed alongside a Paperclip instance that its author upgrades on
their own schedule. A change that only works because core was edited to meet it
is a change that breaks on the next `git pull` upstream — silently, in someone
else's install, with no trace pointing back here. The plugin surface is the
contract; if Plica holds to it, a Paperclip upgrade can break Plica loudly (a
missing export, a failed typecheck) instead of quietly.

It also keeps the boundary honest in the other direction. The `@paperclipai/*`
`link:` dev dependencies mean Plica type-checks against a real Paperclip
checkout — that checkout is a *reference*, read-only. The moment we start
editing it to make Plica compile, it stops telling us anything true.

### What this permits

- Anything under `src/`, `scripts/`, `docs/`, `.github/`, `.githooks/`, and the
  repo's root configuration files.
- Reading from a Paperclip checkout at build time — `scripts/build-css.mjs`
  reads the host stylesheet to subtract its selectors. Reads are fine. Writes
  are not.
- `src/ui/host/` — read-only *copies* of core internals Paperclip does not
  export to plugins. Copying core source into Plica is not modifying core. Keep
  the copies byte-identical to upstream apart from import paths, and keep them
  under `src/ui/host/`; see the README's "Vendored host components" for the two
  documented exceptions.

### What this forbids

- `patch-package`, `pnpm patch`, `pnpm.patchedDependencies`, `patches/`, or any
  committed `.patch` / `.diff`.
- A Paperclip checkout, or a copy of a core package, committed into this repo
  outside `src/ui/host/`.
- Any script that writes above the repository root, into a home directory, or
  into a path naming a Paperclip checkout.
- New `link:`/`file:` dependencies beyond `@paperclipai/plugin-sdk` and
  `@paperclipai/shared`.
- Forking core, or maintaining a private branch of it that Plica depends on.

### When the plugin surface is not enough

This will happen. Some things Plica wants genuinely cannot be expressed through
the extension points core exposes today — an unexported component, a route the
host owns, a hook that does not exist.

**Stop. Do not route around it.** Shimming, monkey-patching, reaching into host
internals at runtime, or "just this one" core edit are all the same failure with
different spellings, and each one is invisible to whoever upgrades next.

Instead:

1. **Open a core-limitation issue** describing what Plica needs, which extension
   point comes closest, and exactly why it falls short. Include the smallest
   change to core that would fix it — as a *request*, not a patch.
2. **Say what the fallback is** if core does not change: the degraded version
   Plica can ship inside the surface today, or nothing.
3. **Let the user decide.** Whether core changes is their call, not the
   contributor's. Park the work — do not merge a workaround while waiting.

A blocked feature is a much cheaper outcome than an install that breaks on
upgrade.

### How it is enforced

`scripts/check-plugin-surface.mjs` encodes the rules above and runs on every
pull request (`.github/workflows/plugin-surface.yml`). It checks changed paths
against the allowed plugin surface and scans changed files for patch tooling,
out-of-repo writes, and unsanctioned local dependency links.

```bash
pnpm check:surface     # scan the whole tree
node ./scripts/check-plugin-surface.mjs --base origin/main   # scan a branch
```

It is dependency-free on purpose: `pnpm install` cannot run in CI, because the
`@paperclipai/*` links point at a Paperclip checkout no runner has.

**There is no bypass.** No skip label, no `--force`, no opt-out comment. A
failing plugin-surface check means either the change belongs somewhere else in
the repo, or it is a core limitation to file. If the allowlist itself is wrong —
a legitimate new top-level directory, say — widen it in its own pull request
that explains why, and let that be reviewed on its own merits.

## Working on Plica

```bash
pnpm install
pnpm dev             # esbuild watch + CSS rebuild
pnpm test            # vitest
pnpm typecheck       # tsc --noEmit
pnpm build           # CSS then bundle
pnpm check:surface   # the guardrail above
pnpm hooks:install   # pre-commit: surface check, typecheck, test
```

The `@paperclipai/*` dev dependencies are `link:` references to a Paperclip
checkout at `~/paperclip`. If yours lives elsewhere, repoint the two paths in
`package.json` locally — but do not commit that repoint.

Rebuilding Paperclip's UI requires rebuilding Plica; the README's "The
stylesheet coupling" explains why, and it is the one operational rule worth
reading before you touch `scripts/build-css.mjs`.

## Pull requests

- One change per branch, branched from `main`. No direct pushes to `main`.
- The description says **what** changed, **why**, and **how it was verified**.
  Paste the test or check output rather than asserting it passed.
- Green CI, including the plugin-surface check.
- Do not merge your own pull request.
- If a change is worth documenting for users, say so in the description so it
  reaches the README and `CHANGELOG.md`.
