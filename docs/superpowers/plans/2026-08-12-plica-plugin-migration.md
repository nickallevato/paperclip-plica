# Plica Plugin Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Plica cross-company HUD out of the Paperclip repo's `LOCAL_CUSTOMIZATIONS` mechanism and into a standalone Paperclip plugin that no repo reset or rebuild can erase.

**Architecture:** A plugin package at the plugin directory (own git repo, outside the Paperclip checkout) contributes one `page` slot at `routePath: "plica"` and one `navigate` launcher in the sidebar zone. All coupling to Paperclip internals is absorbed by a `src/ui/host/` compatibility layer, so the ~2,800 lines of ported Plica code keep importing familiar names. Plugin UI is same-origin trusted JS and calls core `/api/...` endpoints directly.

**Tech Stack:** TypeScript, React 19, `@tanstack/react-query` (bundled by the plugin), esbuild, vitest, `@paperclipai/plugin-sdk`.

**Spec:** `docs/superpowers/specs/2026-08-12-plica-plugin-migration-design.md`

## Global Constraints

- Plugin ID: `nickallevato.plugin-plica`. Route: `/:companyPrefix/plica`.
- **Zero files and zero edits inside `~/paperclip`.** If a task appears to need a core edit, stop and escalate — that requirement is the reason this migration exists.
- Source of truth for ported code is git branch `plica-hud-customization` (commit `9bce08d9b`) in `~/paperclip`. Read it via a detached worktree; never check it out in place.
- Bundle externals are exactly `react`, `react-dom`, `@paperclipai/plugin-sdk/ui`. Everything else is bundled.
- The `plica-hud-customization` branch and its private mirror backup are **never** deleted or amended by this plan. They are the rollback path.
- Cross-company navigation uses full document load (`window.location.assign`), never SPA navigation. See Task 11 for why.
- Node ≥ 22, pnpm. SDK resolved by absolute path: `~/paperclip/packages/plugins/sdk`.

## Reference: Import Mapping Table

Every ported file applies this mapping. It is the single most important artifact in the plan — a task that invents a different mapping produces drift.

| Original import | Replacement |
| --- | --- |
| `@/api/agents` → `agentsApi` | `../host/api` → `agentsApi` |
| `@/api/approvals` → `approvalsApi` | `../host/api` → `approvalsApi` |
| `@/api/attention` → `attentionApi` | `../host/api` → `attentionApi` |
| `@/api/auth` → `authApi` | `../host/api` → `authApi` |
| `@/api/companies-query` → `companiesListQueryOptions` | `../host/api` → `companiesListQueryOptions` |
| `@/api/dashboard` → `dashboardApi` | `../host/api` → `dashboardApi` |
| `@/api/heartbeats` → `heartbeatsApi`, `LiveRunForIssue` | `../host/api` → same names |
| `@/api/issues` → `issuesApi` | `../host/api` → `issuesApi` |
| `@/api/projects` → `projectsApi` | `../host/api` → `projectsApi` |
| `@/api/sidebarBadges` → `sidebarBadgesApi` | `../host/api` → `sidebarBadgesApi` |
| `@/api/workTimeline` → `workTimelineApi` | `../host/api` → `workTimelineApi` |
| `@/components/ui/badge` → `Badge` | `../host/ui-kit` → `Badge` |
| `@/components/ui/button` → `Button` | `../host/ui-kit` → `Button` |
| `@/components/ui/card` → `Card`, `CardContent`, `CardHeader`, `CardTitle` | `../host/ui-kit` → same names |
| `@/components/ui/popover` → `Popover`, `PopoverAnchor`, `PopoverContent`, `PopoverTrigger` | `../host/ui-kit` → same names |
| `@/components/ui/textarea` → `Textarea` | `../host/ui-kit` → `Textarea` |
| `@/components/ui/dropdown-menu` → all names | `../host/ui-kit` → same names |
| `@/components/CompanyPatternIcon` → `CompanyPatternIcon` | `../host/ui-kit` → `CompanyPatternIcon` |
| `@/components/StatusBadge` → `IssueStatusBadge` | `../host/ui-kit` → `IssueStatusBadge` |
| `@/lib/utils` → `cn` | `../host/util` → `cn` |
| `@/lib/queryKeys` → `queryKeys` | `../host/util` → `queryKeys` |
| `@/lib/status-colors` → `priorityColor` | `../host/util` → `priorityColor` |
| `@/lib/company-routes` → `toCompanyRelativePath` | `../host/util` → `toCompanyRelativePath` |
| `@/lib/plica` → any | `../lib/plica` → same names |
| `@/context/ToastContext` → `useToastActions` | `../host/shims` → `useToastActions` |
| `@/context/CompanyContext` → `useOptionalCompany` | `../host/shims` → `useOptionalCompany` |
| `@/context/BreadcrumbContext` → `useBreadcrumbs` | `../host/shims` → `useBreadcrumbs` |
| `@/context/DialogContext` → `useDialogActions` | `../host/shims` → `useDialogActions` |
| `@/components/plica/X` → `X` | `./X` → `X` |

Relative depth: files in `src/ui/components/` use `../host/...` and `../lib/...`. `src/ui/PlicaHud.tsx` uses `./host/...`, `./lib/...`, `./components/...`.

## File Structure

```
the plugin directory/
  package.json                    paperclipPlugin entrypoints, scripts, deps
  tsconfig.json
  esbuild.config.mjs              builds manifest, worker, ui bundle
  vitest.config.ts
  src/
    manifest.ts                   plugin manifest (page slot + launcher)
    worker.ts                     no-op worker
    ui/
      index.ts                    exports PlicaPage
      PlicaPage.tsx               QueryClientProvider wrapper → PlicaHud
      PlicaHud.tsx                ported (462 lines)
      lib/plica.ts                ported (523 lines), pure logic
      components/                 17 ported components (1,806 lines)
      host/
        api.ts                    11 API client modules
        ui-kit/index.ts           vendored shadcn + CompanyPatternIcon + IssueStatusBadge
        util.ts                   cn, queryKeys, priorityColor, toCompanyRelativePath
        shims.ts                  toast / company / breadcrumb / dialog / navigation
  docs/superpowers/{specs,plans}/
```

---

### Task 1: Package scaffold, manifest, no-op worker

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`, `.gitignore`
- Create: `src/manifest.ts`, `src/worker.ts`, `src/ui/index.ts`, `src/ui/PlicaPage.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `PLUGIN_ID = "nickallevato.plugin-plica"`; UI export `PlicaPage` (React component, props `{ slot, context }`); build outputs `dist/manifest.js`, `dist/worker.js`, `dist/ui/index.js`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "paperclip-plugin-plica",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "Plica cross-company HUD for Paperclip.",
  "scripts": {
    "build": "node ./esbuild.config.mjs",
    "dev": "node ./esbuild.config.mjs --watch",
    "test": "vitest run --config ./vitest.config.ts",
    "typecheck": "tsc --noEmit"
  },
  "paperclipPlugin": {
    "manifest": "./dist/manifest.js",
    "worker": "./dist/worker.js",
    "ui": "./dist/ui/"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.62.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "tailwind-merge": "^2.5.5",
    "@radix-ui/react-popover": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-slot": "^1.1.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "esbuild": "^0.28.1",
    "jsdom": "^25.0.1",
    "react": "^19.2.0",
    "react-dom": "^19.2.7",
    "typescript": "^5.7.3",
    "vitest": "^4.1.10"
  },
  "peerDependencies": {
    "react": ">=18"
  }
}
```

- [ ] **Step 2: Create `esbuild.config.mjs`**

```js
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const common = {
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
};

const builds = [
  { ...common, entryPoints: ["src/manifest.ts"], outfile: "dist/manifest.js", platform: "node" },
  { ...common, entryPoints: ["src/worker.ts"], outfile: "dist/worker.js", platform: "node" },
  {
    ...common,
    entryPoints: ["src/ui/index.ts"],
    outfile: "dist/ui/index.js",
    external: ["react", "react-dom", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"],
    jsx: "automatic",
  },
];

if (watch) {
  for (const cfg of builds) {
    const ctx = await context(cfg);
    await ctx.watch();
  }
} else {
  await Promise.all(builds.map((cfg) => build(cfg)));
}
```

- [ ] **Step 3: Create `src/manifest.ts`**

```ts
export const PLUGIN_ID = "nickallevato.plugin-plica";

const manifest = {
  id: PLUGIN_ID,
  name: "Plica",
  version: "0.1.0",
  apiVersion: 1,
  description: "Cross-company HUD: panes, triage, approvals, attention, briefing.",
  categories: ["ui"],
  capabilities: [],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    launchers: [
      {
        id: "plica-sidebar-launcher",
        displayName: "Plica",
        placementZone: "sidebar",
        icon: "Telescope",
        order: 90,
        action: { type: "navigate", target: "plica" },
      },
    ],
    slots: [
      {
        type: "page",
        id: "plica-page",
        displayName: "Plica",
        exportName: "PlicaPage",
        routePath: "plica",
      },
    ],
  },
};

export default manifest;
```

- [ ] **Step 4: Create `src/worker.ts` (no-op)**

```ts
// Plica is a UI-only plugin. All data access happens in the browser against
// core Paperclip HTTP APIs (PLUGIN_SPEC.md §24), so the worker holds no logic.
// The host still requires a worker entrypoint, so this satisfies the contract.
export default {
  async initialize() {
    return { ok: true };
  },
  async shutdown() {
    return { ok: true };
  },
};
```

- [ ] **Step 5: Create `src/ui/PlicaPage.tsx` (placeholder for now)**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function PlicaPage() {
  // The plugin owns its query cache; the host bridge shares only React.
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
  }));

  return (
    <QueryClientProvider client={client}>
      <div data-testid="plica-root">Plica plugin loaded</div>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Create `src/ui/index.ts`**

```ts
export { PlicaPage } from "./PlicaPage";
```

- [ ] **Step 7: Create `tsconfig.json` and `vitest.config.ts`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

Also create `vitest.setup.ts` containing exactly `import "@testing-library/jest-dom";` and `.gitignore` containing `node_modules/` and `dist/`.

- [ ] **Step 8: Install and build**

Run: `cd the plugin directory && pnpm install && pnpm build`
Expected: `dist/manifest.js`, `dist/worker.js`, `dist/ui/index.js` all exist.

- [ ] **Step 9: Install into the running instance**

Run: `paperclipai plugin install the plugin directory`
Expected: install succeeds; the pre-install probe reports the expected instance.

- [ ] **Step 10: Verify plumbing in the app**

Navigate to `/<yourprefix>/plica`. Expected: "Plica plugin loaded" renders, and a "Plica" item appears in the sidebar. This proves manifest, slot, launcher, bundle loading, and bridge wiring all work before any real code moves.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Plica plugin package with page slot and sidebar launcher"
```

---

### Task 2: `host/util.ts` — small vendored utilities

**Files:**
- Create: `src/ui/host/util.ts`, `src/ui/host/util.test.ts`
- Read from: worktree of `plica-hud-customization` → `ui/src/lib/utils.ts`, `ui/src/lib/queryKeys.ts`, `ui/src/lib/status-colors.ts`, `ui/src/lib/company-routes.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `cn(...inputs: ClassValue[]): string`; `queryKeys` (object; only the branches Plica reads); `priorityColor(priority: string): string`; `toCompanyRelativePath(prefix: string, path: string): string`.

- [ ] **Step 1: Create the read-only worktree**

```bash
cd ~/paperclip
git worktree add --detach /tmp/plica-src plica-hud-customization
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { cn, priorityColor, toCompanyRelativePath } from "./util";

describe("host/util", () => {
  it("merges class names with tailwind conflict resolution", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });

  it("returns a distinct class per priority", () => {
    const urgent = priorityColor("urgent");
    const low = priorityColor("low");
    expect(urgent).toBeTruthy();
    expect(urgent).not.toBe(low);
  });

  it("builds a company-relative path", () => {
    expect(toCompanyRelativePath("acme", "issues")).toBe("/acme/issues");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- util`
Expected: FAIL — cannot resolve `./util`.

- [ ] **Step 4: Implement `src/ui/host/util.ts`**

Copy the four source files' relevant exports into one module. `cn` is verbatim (`clsx` + `twMerge`). `priorityColor` and `toCompanyRelativePath` are verbatim. For `queryKeys`, copy **only** the branches Plica actually reads — do not vendor the whole host object; an over-large copy is a drift liability. Verify against `/tmp/plica-src/ui/src/lib/queryKeys.ts` which branches those are by grepping Plica's usages:

```bash
grep -rhoE 'queryKeys\.[a-zA-Z.]+' /tmp/plica-src/ui/src/components/plica /tmp/plica-src/ui/src/pages/PlicaHud.tsx | sort -u
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- util`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add host/util vendored utilities"
```

---

### Task 3: `host/api.ts` — core API client

**Files:**
- Create: `src/ui/host/api.ts`, `src/ui/host/api.test.ts`
- Read from: `/tmp/plica-src/ui/src/api/{agents,approvals,attention,auth,companies-query,dashboard,heartbeats,issues,projects,sidebarBadges,workTimeline}.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `agentsApi`, `approvalsApi`, `attentionApi`, `authApi`, `companiesListQueryOptions`, `dashboardApi`, `heartbeatsApi`, `issuesApi`, `projectsApi`, `sidebarBadgesApi`, `workTimelineApi`, and type `LiveRunForIssue`. Each keeps the **exact method names and signatures** the original modules expose, so ported components need no call-site changes.

This is the layer most exposed to upstream drift, so it is the only ported layer that gets new tests written from scratch.

- [ ] **Step 1: Enumerate the exact methods Plica calls**

```bash
grep -rhoE '(agentsApi|approvalsApi|attentionApi|authApi|dashboardApi|heartbeatsApi|issuesApi|projectsApi|sidebarBadgesApi|workTimelineApi)\.[a-zA-Z]+' \
  /tmp/plica-src/ui/src/components/plica /tmp/plica-src/ui/src/pages/PlicaHud.tsx | sort -u
```

Implement exactly these methods and no others. Anything unused is dead weight that will drift.

- [ ] **Step 2: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issuesApi } from "./api";

describe("host/api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ issues: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
  });

  it("calls the core endpoint same-origin with credentials", async () => {
    await issuesApi.list({ companyId: "c1" });
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(String(url)).toContain("/api/");
    expect(init?.credentials).toBe("same-origin");
  });

  it("throws a useful error on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(issuesApi.list({ companyId: "c1" })).rejects.toThrow(/500/);
  });
});
```

Adjust `issuesApi.list`'s argument shape to match what Step 1 revealed.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- api`
Expected: FAIL — cannot resolve `./api`.

- [ ] **Step 4: Implement `src/ui/host/api.ts`**

Write one shared `request()` helper, then the eleven API objects on top of it:

```ts
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`Paperclip API ${path} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}
```

Copy each original module's endpoint paths and response types verbatim from `/tmp/plica-src/ui/src/api/`. Keep `companiesListQueryOptions` as a react-query options object exactly as the original exports it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add host/api client for core Paperclip endpoints"
```

---

### Task 4: `host/ui-kit` and `host/shims.ts`

**Files:**
- Create: `src/ui/host/ui-kit/index.ts` (+ one file per primitive), `src/ui/host/shims.ts`, `src/ui/host/shims.test.tsx`
- Read from: `/tmp/plica-src/ui/src/components/ui/{button,badge,card,popover,textarea,dropdown-menu}.tsx`, `/tmp/plica-src/ui/src/components/{CompanyPatternIcon,StatusBadge}.tsx`

**Interfaces:**
- Consumes: `cn` from `../util`.
- Produces (ui-kit): `Button`, `Badge`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Popover`, `PopoverAnchor`, `PopoverContent`, `PopoverTrigger`, `Textarea`, dropdown-menu exports, `CompanyPatternIcon`, `IssueStatusBadge`.
- Produces (shims): `useToastActions()`, `useOptionalCompany()`, `useBreadcrumbs()`, `useDialogActions()`, `navigateToCompanyPath(prefix: string, path: string): void`.

- [ ] **Step 1: Vendor the primitives**

Copy each shadcn file verbatim, changing only its `@/lib/utils` import to `../util`. Re-export all of them from `ui-kit/index.ts`. These are copy-into-project components by design; vendoring is the intended usage, not a workaround.

- [ ] **Step 2: Write the failing test for shims**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useOptionalCompany, navigateToCompanyPath } from "./shims";

function Probe() {
  const company = useOptionalCompany();
  return <span>{company?.prefix ?? "none"}</span>;
}

describe("host/shims", () => {
  it("reads company prefix from host context", () => {
    render(<Probe />);
    expect(screen.getByText(/none|[a-z]+/)).toBeInTheDocument();
  });

  it("navigates cross-company with a full document load", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    navigateToCompanyPath("other", "plica");
    expect(assign).toHaveBeenCalledWith("/other/plica");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- shims`
Expected: FAIL — cannot resolve `./shims`.

- [ ] **Step 4: Implement `src/ui/host/shims.ts`**

Map each host context onto the plugin SDK:

```ts
import { useHostContext, usePluginToast, useHostNavigation } from "@paperclipai/plugin-sdk/ui";

export function useToastActions() {
  const toast = usePluginToast();
  return {
    showToast: (message: string, variant?: "success" | "error") =>
      toast({ message, variant: variant ?? "success" }),
  };
}

export function useOptionalCompany() {
  const host = useHostContext();
  return host.companyId
    ? { id: host.companyId, prefix: host.companyPrefix ?? null }
    : null;
}

// The host owns the breadcrumb trail for plugin pages; Plica's own calls
// become no-ops rather than fighting host chrome.
export function useBreadcrumbs() {
  return { setBreadcrumbs: () => {} };
}

/**
 * Cross-company navigation must be a full document load.
 *
 * `shouldSyncCompanySelectionFromRoute` (host: ui/src/lib/company-selection.ts)
 * returns false whenever selectionSource === "manual" and a company is already
 * selected, and CompanyContext only ever resets that back to "bootstrap" in its
 * default-pick effect, which early-returns once a company is set. So after any
 * manual company switch, SPA navigation to another prefix leaves the chrome
 * pointing at the old company for the rest of the session. A document load
 * remounts the app and restores correct sync without touching core.
 */
export function navigateToCompanyPath(prefix: string, path: string): void {
  window.location.assign(`/${prefix}/${path.replace(/^\/+/, "")}`);
}
```

`useDialogActions` returns `{ openNewIssueDialog: null }`; Task 10 resolves how Plica's quick-create behaves without the host dialog.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- shims`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add vendored ui-kit and host context shims"
```

---

### Task 5: Port `lib/plica.ts`

**Files:**
- Create: `src/ui/lib/plica.ts`, `src/ui/lib/plica.test.ts`
- Read from: `/tmp/plica-src/ui/src/lib/plica.ts` (523 lines), `/tmp/plica-src/ui/src/lib/plica.test.ts`

**Interfaces:**
- Consumes: nothing (pure logic; this is why it ports first).
- Produces: `derivePaneHealth`, `healthLabel`, `PLICA_HEALTH_DOT_CLASSES`, `plicaRefetchInterval`, `relativeTimeLabel`, `attentionDetailText`, `deriveBriefingLine`, `detectAlertEdges`, `issueStatusLabel`, `nudgeTitle`, `sparklineDays`, `summarizePayloadEntries`, types `PlicaAlertEvent`, `PlicaAlertSnapshot`.

- [ ] **Step 1: Copy the test file first**

```bash
cp /tmp/plica-src/ui/src/lib/plica.test.ts src/ui/lib/plica.test.ts
```

Change only its import path to `./plica`. This is the first real regression signal — the file is pure logic with no host coupling, so it should need no other edits.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- plica`
Expected: FAIL — cannot resolve `./plica`.

- [ ] **Step 3: Copy the implementation**

```bash
cp /tmp/plica-src/ui/src/lib/plica.ts src/ui/lib/plica.ts
```

Apply the mapping table. Expect few or no changes — verify with `grep -n '@/' src/ui/lib/plica.ts`, which must return nothing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- plica`
Expected: PASS, all original assertions green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: port plica derivation logic with its test suite"
```

---

### Task 6: Port leaf components (Sparkline, RunsStrip, IssueHover, DockedTile)

**Files:**
- Create: `src/ui/components/{PlicaSparkline,PlicaRunsStrip,PlicaIssueHover,PlicaDockedTile}.tsx`
- Create: `src/ui/components/{PlicaSparkline,PlicaRunsStrip}.test.tsx`
- Read from: `/tmp/plica-src/ui/src/components/plica/`

**Interfaces:**
- Consumes: `../host/ui-kit`, `../host/util`, `../lib/plica`, `../host/api`.
- Produces: `PlicaSparkline`, `PlicaRunsStrip`, `PlicaIssueHover`, `PlicaDockedTile` — props unchanged from the originals.

- [ ] **Step 1: Copy the two test files, fixing import paths only**

```bash
cp /tmp/plica-src/ui/src/components/plica/PlicaSparkline.test.tsx src/ui/components/
cp /tmp/plica-src/ui/src/components/plica/PlicaRunsStrip.test.tsx src/ui/components/
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- Plica`
Expected: FAIL — component modules not found.

- [ ] **Step 3: Copy the four components and apply the mapping table**

Copy each file, then rewrite its imports per the mapping table. Verify no host aliases survive:

```bash
grep -rn '@/' src/ui/components/ || echo "clean"
```

Expected: `clean`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- Plica`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: port Plica leaf components"
```

---

### Task 7: Port card and row components (AttentionCard, ApprovalRow, IssuePreviewCard, CeoStrip, CeoNudge, QuickActions)

**Files:**
- Create: `src/ui/components/{PlicaAttentionCard,PlicaApprovalRow,PlicaIssuePreviewCard,PlicaCeoStrip,PlicaCeoNudge,PlicaQuickActions}.tsx`
- Create: `src/ui/components/{PlicaCeoNudge,PlicaQuickActions}.test.tsx`

**Interfaces:**
- Consumes: Task 6 components, `../host/*`, `../lib/plica`.
- Produces: the six named components, props unchanged.

- [ ] **Step 1: Copy the two test files**

```bash
cp /tmp/plica-src/ui/src/components/plica/PlicaCeoNudge.test.tsx src/ui/components/
cp /tmp/plica-src/ui/src/components/plica/PlicaQuickActions.test.tsx src/ui/components/
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- Plica`
Expected: FAIL on the two new suites.

- [ ] **Step 3: Copy the six components and apply the mapping table**

`PlicaQuickActions` consumes `useDialogActions`; with the shim returning `openNewIssueDialog: null`, hide the quick-create affordance when it is null rather than rendering a dead control. Keep every other action working.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- Plica`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: port Plica card and row components"
```

---

### Task 8: Port section components (ApprovalsSection, AttentionSection, TriageSection, Briefing)

**Files:**
- Create: `src/ui/components/{PlicaApprovalsSection,PlicaAttentionSection,PlicaTriageSection,PlicaBriefing}.tsx`
- Create: `src/ui/components/{PlicaApprovalsSection,PlicaTriageSection,PlicaBriefing}.test.tsx`

**Interfaces:**
- Consumes: Task 7 components, `../host/api`, `../lib/plica`.
- Produces: the four section components, props unchanged.

- [ ] **Step 1: Copy the three test files**

```bash
cp /tmp/plica-src/ui/src/components/plica/PlicaApprovalsSection.test.tsx src/ui/components/
cp /tmp/plica-src/ui/src/components/plica/PlicaTriageSection.test.tsx src/ui/components/
cp /tmp/plica-src/ui/src/components/plica/PlicaBriefing.test.tsx src/ui/components/
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- Plica`
Expected: FAIL on the three new suites.

- [ ] **Step 3: Copy the four components and apply the mapping table**

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- Plica`
Expected: PASS. These suites cover the `deriveActionable`/`deriveTriageSummary` approval-dedup behavior, so green here confirms the API layer returns the shapes the logic expects.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: port Plica section components"
```

---

### Task 9: Port `PlicaCompanyPane` and `PlicaCompanySlot`

**Files:**
- Create: `src/ui/components/PlicaCompanyPane.tsx` (384 lines — the largest), `src/ui/components/PlicaCompanySlot.tsx`
- Create: `src/ui/components/PlicaCompanyPane.test.tsx`

**Interfaces:**
- Consumes: all prior components, `../host/api`, `../lib/plica`.
- Produces: `PlicaCompanyPane`, `PlicaCompanySlot`, props unchanged.

- [ ] **Step 1: Copy the test file**

```bash
cp /tmp/plica-src/ui/src/components/plica/PlicaCompanyPane.test.tsx src/ui/components/
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- PlicaCompanyPane`
Expected: FAIL — module not found.

- [ ] **Step 3: Copy both components and apply the mapping table**

At 384 lines this is the densest port. After copying, confirm no host aliases remain and that every `queryKeys.*` reference resolves against the branches vendored in Task 2 — a missing branch shows up here first.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- Plica`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: port Plica company pane and slot"
```

---

### Task 10: Port `PlicaHud` and wire it into `PlicaPage`

**Files:**
- Create: `src/ui/PlicaHud.tsx` (462 lines), `src/ui/PlicaHud.test.tsx`
- Modify: `src/ui/PlicaPage.tsx`

**Interfaces:**
- Consumes: every component from Tasks 6–9, `./host/*`, `./lib/plica`.
- Produces: `PlicaHud` (default wall/triage view with kiosk mode, dock-all/undock-all, alert pulse); `PlicaPage` now renders it inside the `QueryClientProvider`.

- [ ] **Step 1: Copy the test file**

```bash
cp /tmp/plica-src/ui/src/pages/PlicaHud.test.tsx src/ui/PlicaHud.test.tsx
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- PlicaHud`
Expected: FAIL — module not found.

- [ ] **Step 3: Copy `PlicaHud.tsx` and apply the mapping table**

Note the depth difference: this file sits at `src/ui/`, so it imports `./components/X`, `./host/X`, `./lib/plica`. Preserve the `--plica-fs-micro/body/stat` CSS variables set on `documentElement` for kiosk type scale — same-origin plugin code can still set them. Preserve `plica.collapsed` localStorage read/write for dock state.

- [ ] **Step 4: Replace the placeholder body of `PlicaPage.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PlicaHud } from "./PlicaHud";

export function PlicaPage() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
  }));

  return (
    <QueryClientProvider client={client}>
      <PlicaHud />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS — all suites including the ported originals.

- [ ] **Step 6: Build and verify in the app**

Run: `pnpm build`, then reload `/<prefix>/plica`.
Expected: the full HUD renders with panes, approvals, attention, briefing, and sparklines.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: port PlicaHud and render it from the plugin page"
```

---

### Task 11: Port `PlicaLink` with full-load cross-company navigation

**Files:**
- Create: `src/ui/components/PlicaLink.tsx`, `src/ui/components/PlicaLink.test.tsx`
- Modify: any component importing `PlicaLink` (Tasks 7–9) to use it

**Interfaces:**
- Consumes: `navigateToCompanyPath` from `../host/shims`.
- Produces: `PlicaLink` — same props as the original, but click performs a document load instead of `setSelectedCompanyId(..., { source: "route_sync" })` + SPA navigate.

This task is last because it is the only component whose behavior genuinely changes.

- [ ] **Step 1: Copy the test file and update its expectations**

```bash
cp /tmp/plica-src/ui/src/components/plica/PlicaLink.test.tsx src/ui/components/
```

The original asserts `setSelectedCompanyId` is called with `{ source: "route_sync" }`. That API does not exist in the plugin. Replace those assertions with:

```tsx
it("navigates cross-company with a full document load", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  render(<PlicaLink companyPrefix="other" to="issues">Go</PlicaLink>);
  await userEvent.click(screen.getByText("Go"));
  expect(assign).toHaveBeenCalledWith("/other/issues");
});
```

Match the original's actual prop names when copying.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- PlicaLink`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PlicaLink`**

Render an anchor with a real `href` (so middle-click and copy-link behave), and in `onClick` call `event.preventDefault()` then `navigateToCompanyPath(...)`. Do not call SPA navigation.

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Verify cross-company navigation manually**

In the app: switch companies manually via the switcher, open `/<prefix>/plica`, then click a pane belonging to a *different* company. Expected: the target company's page loads **and the sidebar/switcher chrome shows that company**. This is the exact scenario the host bug breaks under SPA navigation, so it is verified by hand rather than by unit test.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: port PlicaLink with full-load cross-company navigation"
```

---

### Task 12: Cutover and backup

**Files:**
- Modify: the host's nightly upgrade script (remove one `LOCAL_CUSTOMIZATIONS` entry)
- No other changes outside the plugin repo.

**Interfaces:**
- Consumes: a verified working plugin from Task 11.
- Produces: a Paperclip checkout with zero Plica files and no Plica customization entry.

Nothing here is destructive to the rollback path: the `plica-hud-customization` branch and its private mirror backup survives untouched.

- [ ] **Step 1: Confirm the plugin is fully working**

Re-verify `/<prefix>/plica` renders the complete HUD on the current canary build. Do not proceed otherwise.

- [ ] **Step 2: Push the plugin repo to the private mirror**

```bash
cd the plugin directory
git remote add mirror <remote-url>
git push -u mirror main
```

Create the remote repo first if it does not exist.

- [ ] **Step 3: Remove the customization entry**

In the host's nightly upgrade script, delete the `plica-hud-customization|...` entry from `LOCAL_CUSTOMIZATIONS` and its two explanatory comment lines. Leave the other local customizations untouched.

- [ ] **Step 4: Verify the script still parses**

Run: `bash -n the nightly upgrade script && the nightly upgrade script --dry-run`
Expected: no syntax error; dry-run reports 3 customizations, not 4.

- [ ] **Step 5: Return the Paperclip checkout to clean upstream**

```bash
cd ~/paperclip
git worktree remove --force /tmp/plica-src
git status --porcelain --untracked-files=no
```

Expected: empty. Do **not** delete the `plica-hud-customization` branch.

- [ ] **Step 6: Verify Plica survives a rebuild**

Rebuild the UI from the clean checkout and reload `/<prefix>/plica`. Expected: Plica still renders — this is the whole point of the migration, and the one check that proves the 2026-08-11 failure cannot recur.

- [ ] **Step 7: Commit**

```bash
cd the plugin directory
git add -A && git commit -m "docs: record cutover completion"
git push mirror main
```

---

## Deferred / Out of Scope

- The nightly script's skip-before-reapply ordering bug: when the version guard declines an upgrade, `reapply_local_customizations` never runs. After this migration it no longer affects Plica, but the other local customizations still ride that path and have not been re-applied since 2026-08-07.
- Restoring `/plica` as a global company-less route (needs a host `scope: "global"` page slot; rejected to keep the core footprint at zero).
- Upstreaming the `shouldSyncCompanySelectionFromRoute` fix to paperclipai/paperclip.
