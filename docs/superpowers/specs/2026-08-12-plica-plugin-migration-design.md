# Plica → Paperclip Plugin Migration

**Date:** 2026-08-12
**Status:** Approved design, pending implementation plan

## Problem

The Plica cross-company HUD is deployed through the `LOCAL_CUSTOMIZATIONS`
mechanism in the host's nightly upgrade script: a single squashed commit
on branch `plica-hud-customization`, 3-way applied onto a freshly built upstream
tree, landing only in `dist/`. Nothing is merged into the repo.

That mechanism failed on 2026-08-11, and the failure is structural rather than
accidental:

1. Since 2026-08-08 the nightly declines the Paperclip upgrade entirely, because
   the instance runs `canary/v2026.807.0-canary.13` while the script targets the
   latest *stable* tag (`v2026.722.0`). The downgrade guard fires and returns
   before `reapply_local_customizations` is ever called — every run since logs
   `palette=(n/a)`.
2. On 2026-08-11 the repo was moved to a feature branch and `ui/dist/` was
   rebuilt from a stock tree at 23:53, with a service restart at 23:55. The
   rebuild replaced the customized bundle with a stock one.

Because Plica exists only inside `dist/`, any rebuild from a clean tree erases
it silently. The build stays healthy (HTTP 200), so nothing signals the loss.

A second problem compounds it: the customization branch is based on
`v2026.722.0` and no longer applies. A real 3-way apply against current HEAD
exits 1 with conflicts in `ui/src/components/Sidebar.tsx` (import-list
collision) and `ui/src/components/SidebarCompanyMenu.tsx` (upstream's new
cloud-stack switcher rewrote the regions Plica v4 modifies). Even a working
nightly would now skip Plica.

## Goals

- Plica survives repo resets, rebases, canary rebuilds, and stock builds.
- Zero Plica files in the Paperclip checkout; zero core edits to conflict.
- Preserve the feature set: cross-company panes, triage, approvals, attention,
  briefing, sparklines, kiosk mode, one-click sidebar access.
- Keep the existing test suite as the regression harness for the port.

## Non-goals

- Restoring `/plica` as a global, company-less route (see Decisions).
- Fixing the nightly script's skip-before-reapply ordering. It stops affecting
  Plica after this migration, but still affects the other local customizations. Tracked separately.
- Upstreaming Plica to paperclipai/paperclip.

## Decisions

**Deploy as a real plugin, not a customization.** Paperclip has a first-class
plugin system (`doc/plugins/PLUGIN_SPEC.md`) with `page` and `sidebar` UI slots,
dynamic ESM loading of plugin bundles, per-plugin error boundaries, and a host
bridge that injects React and an SDK component kit.

**The package lives outside the Paperclip checkout**, in its own git repo at
the plugin directory, backed up to a private mirror, installed by absolute path via
`paperclipai plugin install`. Local-path installs read source from disk and the
host watches the package's declared entrypoints. Because nothing lives inside
the Paperclip repo, no reset or rebuild can reach it. This is the property that
directly addresses the 2026-08-11 failure.

**Accept the company-prefixed route `/:prefix/plica`.** Plugin `page` slots are
mounted through `boardRoutes()`, which is attached only under
`<Route path=":companyPrefix" element={<Layout />}>` (`ui/src/App.tsx:616`),
with the plugin catch-all `:pluginRoutePath/*` inside it (`ui/src/App.tsx:304`).
A company-less plugin page is therefore impossible without a host change.

The alternative was a small, generic, upstreamable host patch adding a
`scope: "global"` page slot. It was rejected in favour of a zero-core-footprint
plugin: any core edit, however small, reintroduces the conflict-and-erase cycle
this migration exists to end. The cost is accepted knowingly — the v4 global
route is reverted, `company-page-memory`'s `GLOBAL_SEGMENTS` entry becomes moot,
and the all-companies switcher chrome needs rework.

## Architecture

```
the plugin directory/
  package.json              paperclipPlugin: { manifest, worker, ui }
  src/manifest.ts           1 page slot, 1 navigate launcher → dist/manifest.js
  src/worker.ts             no-op worker (required entrypoint)
  src/ui/
    index.ts                exports PlicaPage — the only host contract
    PlicaHud.tsx            + ~20 plica components, ported near-verbatim
    lib/plica.ts            pure derivation logic, moves unchanged
    host/                   compatibility layer — see below
      api.ts                typed client over core /api/... endpoints
      ui-kit/               vendored shadcn primitives
      shims.ts              toast / navigation / company context → plugin SDK
  dist/ui/index.js          bundle; externals: react, react-dom, sdk/ui
```

### The `host/` boundary

Every coupling to Paperclip internals is absorbed in `src/ui/host/`, so the
~2,800 lines of Plica code keep importing familiar names and stay close to
verbatim. When upstream drifts, one directory changes rather than 31 files.
That directory is the upstream contract, made explicit and independently
testable.

Measured coupling in the current implementation:

| Current import | Count | Plugin replacement |
| --- | --- | --- |
| `@/api/*` (issues, heartbeats, dashboard, approvals, projects, agents, attention, auth, companies-query, workTimeline, sidebarBadges) | 11 modules / 20 sites | `host/api.ts` — same endpoints, same-origin, session cookie |
| `@/components/ui/*` (button, popover, badge, textarea, card, dropdown-menu) | 6 modules / 16 sites | `host/ui-kit/` — vendored copies |
| `@/context/*` (Toast, Dialog, Company, Breadcrumb) | 4 modules / 6 sites | `host/shims.ts` → `usePluginToast`, `useHostNavigation`, `useHostContext` |
| `@/lib/*` (utils, queryKeys, status-colors, company-routes), `CompanyPatternIcon`, `StatusBadge` | 6 modules / 18 sites | small vendored copies under `host/` |
| `@/lib/plica` | 15 | moves wholesale, unchanged |

### Data access

Plugin UI runs as same-origin trusted JavaScript. PLUGIN_SPEC.md §24 states
that manifest capabilities gate worker-side host RPC only, and "do not prevent
plugin UI code from calling ordinary Paperclip HTTP APIs directly." Plica's
cross-company reads therefore port essentially 1:1 against the same endpoints,
carrying the existing session cookie. No worker-side data path is required,
which is why the worker entrypoint is a no-op.

### React Query

The bridge shares only `react` and `react-dom`, so the plugin bundles its own
`@tanstack/react-query` and mounts its own `QueryClientProvider` at the Plica
root. Its cache is independent of the host's. This is acceptable because Plica
polls its own aggregates and never invalidates host queries.

### Sidebar entry

`ui/src/components/Sidebar.tsx:257` already renders a `sidebar` slot outlet and
sidebar-zone launchers. The pinned Plica item is contributed as a `navigate`
launcher, requiring no core edit and no component export.

## Risks

**Cross-prefix navigation (highest).** Under `/:prefix/plica`, clicking a
company pane becomes ordinary cross-prefix navigation, which removes v4's
`setSelectedCompanyId({source: "route_sync"})` workaround. But the underlying
upstream bug may persist: `shouldSyncCompanySelectionFromRoute` in
`ui/src/lib/company-selection.ts` permanently blocks URL→company sync once
`selectionSource` is `"manual"`, and nothing resets it. If it still reproduces
on current canary, the chrome will not follow the URL after any manual company
switch. Mitigation: probe before porting (Step 0); if confirmed, handle inside
`host/shims.ts` rather than editing core.

**SDK build dependency.** `@paperclipai/plugin-sdk` is a workspace package
inside the Paperclip repo. An external plugin references it at build/type time
via `--sdk-path`. A repo move or SDK API drift breaks the plugin *build* — never
the running install, since UI externals resolve through the runtime bridge.
Mitigation: pin the SDK path in build config and treat SDK drift as a build-time
failure to fix deliberately.

**Vendored shadcn drift.** Vendored primitives no longer track upstream restyles,
so Plica's look can diverge from the host over time. Accepted: visual drift is
strictly preferable to erasure, and shadcn is copy-into-project by design.

## Testing

The existing suite ports with the code and is the primary safety net: 11 files,
2,499 lines, covering `PlicaLink`, triage derivation, sparklines, approvals,
briefing, quick actions, runs strip, company pane, and `plica.test.ts`.

- `lib/plica.ts` tests should pass essentially unmodified — first green signal.
- Each component's test ports alongside it, so a bad `host/` mapping surfaces at
  that component rather than at integration time.
- One new suite for `host/api.ts`, the layer that did not previously exist and
  is the most exposed to upstream endpoint drift.
- Cross-prefix navigation requires manual verification in the running app; it
  depends on host routing that unit tests cannot reach.

## Implementation sequence

Step 0 and the Step 1 verification require a running instance. Both are deferred
until the in-progress Paperclip DB cleanup is finished. Steps 1–5 code, and all
unit testing, proceed without touching the app.

0. **Probe cross-prefix sync** (requires app). From `/acme/dashboard`, switch
   company manually, navigate to `/other/dashboard`, observe whether the chrome
   follows. Determines `PlicaLink`'s implementation.
1. **Scaffold + no-op worker.** Manifest with page slot and navigate launcher,
   empty `PlicaPage`. Install and confirm `/acme/plica` renders and the sidebar
   item appears (requires app) — proves plumbing before code moves.
2. **`host/` layer.** API client, vendored primitives, shims, with unit tests.
3. **`lib/plica.ts` + tests.** Pure logic, no host coupling.
4. **Components leaf-first:** Sparkline → RunsStrip → CompanyPane → sections →
   `PlicaHud`, each with its test.
5. **`PlicaLink` last**, informed by Step 0.

## Cutover

Sequenced so nothing is surrendered until the replacement is proven:

1. Install the plugin; verify `/acme/plica` fully working on current canary.
2. Only then remove `plica-hud-customization` from `LOCAL_CUSTOMIZATIONS`.
3. Leave the `plica-hud-customization` branch and its private mirror backup untouched as
   the rollback path.
4. `git reset --hard` the Paperclip checkout to clean upstream.

If step 1 fails, nothing is lost: the old branch remains deployable exactly as
before.
