import esbuild from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
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
 * the host silently renders its slot placeholder ("Plica: Plica") instead of
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
/**
 * The record of which host stylesheet `scripts/build-css.mjs` subtracted
 * against, inlined so `src/ui/lib/host-stylesheet.ts` can compare it with the
 * sheet the document actually loaded and warn when a Paperclip upgrade has left
 * Plica's build stale. See the README's "The stylesheet coupling".
 *
 * Inlined rather than imported because the generated file is not committed —
 * it names one developer's host build — and `tsc --noEmit` runs before
 * `pnpm build` in CI, where an import of a file that does not exist yet would
 * fail the typecheck. Absent, it defines to `null` and the check stays silent.
 */
function hostCssDefine() {
  const stamp = "src/ui/host-css.generated.json";
  if (!existsSync(stamp)) {
    console.warn(`${stamp} missing — the stale-stylesheet check will stay silent in this bundle`);
    return "null";
  }
  return JSON.stringify(JSON.parse(readFileSync(stamp, "utf8")));
}
presets.esbuild.ui.define = { ...(presets.esbuild.ui.define ?? {}), __PLICA_HOST_CSS_BUILD__: hostCssDefine() };
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
