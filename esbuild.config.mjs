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
