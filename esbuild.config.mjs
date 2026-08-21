import esbuild from "esbuild";
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
const watch = process.argv.includes("--watch");

const workerCtx = await esbuild.context(presets.esbuild.worker);
const manifestCtx = await esbuild.context(presets.esbuild.manifest);
const uiCtx = await esbuild.context(presets.esbuild.ui);

if (watch) {
  await Promise.all([workerCtx.watch(), manifestCtx.watch(), uiCtx.watch()]);
  console.log("esbuild watch mode enabled for worker, manifest, and ui");
} else {
  await Promise.all([workerCtx.rebuild(), manifestCtx.rebuild(), uiCtx.rebuild()]);
  await Promise.all([workerCtx.dispose(), manifestCtx.dispose(), uiCtx.dispose()]);
}
