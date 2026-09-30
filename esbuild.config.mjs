import esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

/**
 * Uses the SDK's bundler presets rather than hand-rolled esbuild options.
 *
 * The presets encode the host loader contract: the UI bundle externalizes
 * react/react-dom/jsx-runtime and `@paperclipai/plugin-sdk/ui` (the host bridge
 * rewrites those bare specifiers to blob URLs at load time), while the worker
 * bundle inlines the SDK so `dist/worker.js` runs standalone.
 */
const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.ts" });

/**
 * The UI bundle must NOT be whitespace-minified.
 *
 * The host rewrites the bundle's bare specifiers to blob URLs before importing
 * it, and that rewrite is a literal string replace requiring a leading space:
 *
 *   result.replaceAll(` from "react"`, ` from "<blob>"`)
 *   — ui/src/plugins/slots.tsx, rewriteBareSpecifiers()
 *
 * Whitespace minification emits `from"react"`, which the rewrite misses. The
 * browser then cannot resolve the bare specifier, the dynamic import fails, and
 * the host silently renders its slot placeholder ("Tickler: Tickler") instead of
 * the page — with no console error pointing at the cause.
 *
 * Identifier and syntax minification are safe and still cut the bundle roughly
 * in half, so they stay on.
 */
presets.esbuild.ui.minifyIdentifiers = true;
presets.esbuild.ui.minifySyntax = true;
presets.esbuild.ui.minifyWhitespace = false;
// The compiled utility stylesheet is bundled as a string and injected at
// runtime (src/ui/styles.ts) — the host loads no plugin CSS of its own.
presets.esbuild.ui.loader = { ...(presets.esbuild.ui.loader ?? {}), ".css": "text" };

const root = dirname(fileURLToPath(import.meta.url));
const reactDomCompat = resolve(root, "src/ui/react-dom-compat.ts");

/**
 * Every `react-dom` import in the UI bundle goes through
 * `src/ui/react-dom-compat.ts`, which is where the reason lives: the host's
 * shim exports five names and `@dnd-kit/core` asks for a sixth, which is an ES
 * module link error and takes the whole plugin down with it.
 *
 * `onResolve` rather than `alias`, and rather than dropping `react-dom` from
 * `external`, because both of those are indiscriminate: the compat module's own
 * `import ReactDOM from "react-dom"` has to keep reaching the host shim, or it
 * resolves to itself (alias) or bundles a second copy of React's DOM renderer
 * (no external). A plugin sees the importer, so it can make that one line the
 * exception. Only the bare `react-dom` is touched — `react-dom/client` does not
 * match the filter and stays external as it was.
 */
presets.esbuild.ui.plugins = [
  ...(presets.esbuild.ui.plugins ?? []),
  {
    name: "tickler-react-dom-compat",
    setup(build) {
      build.onResolve({ filter: /^react-dom$/ }, (args) =>
        args.importer === reactDomCompat
          ? { path: "react-dom", external: true }
          : { path: reactDomCompat },
      );
    },
  },
];
/**
 * The demo fixture ships as a real file rather than being bundled into the UI
 * JS, so it can be edited (renamed companies, different ticket titles) and
 * picked up on the next page load without a rebuild. The host serves anything
 * under `dist/ui/` with the right MIME type, so a plain copy is all it takes.
 */
function copyDemoData() {
  mkdirSync("dist/ui", { recursive: true });
  copyFileSync("src/ui/demo/demo-data.json", "dist/ui/demo-data.json");
}

const watch = process.argv.includes("--watch");

const workerCtx = await esbuild.context(presets.esbuild.worker);
const manifestCtx = await esbuild.context(presets.esbuild.manifest);
const uiCtx = await esbuild.context(presets.esbuild.ui);

copyDemoData();

if (watch) {
  await Promise.all([workerCtx.watch(), manifestCtx.watch(), uiCtx.watch()]);
  console.log("esbuild watch mode enabled for worker, manifest, and ui");
} else {
  await Promise.all([workerCtx.rebuild(), manifestCtx.rebuild(), uiCtx.rebuild()]);
  await Promise.all([workerCtx.dispose(), manifestCtx.dispose(), uiCtx.dispose()]);
}
