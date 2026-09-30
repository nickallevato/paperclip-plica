/**
 * `react-dom` for the bundle, because the host's shim exports five names and a
 * dependency may ask for a sixth.
 *
 * The host does not let a plugin import React itself. It marks `react` and
 * `react-dom` external, then rewrites those bare specifiers to blob URLs whose
 * modules re-export the single instance it already has
 * (ui/src/plugins/slots.tsx, `getShimBlobUrl`). The `react-dom` blob is, in
 * full:
 *
 * ```js
 * const RD = globalThis.__paperclipPluginBridge__?.reactDom;
 * export default RD;
 * const { createRoot, hydrateRoot, createPortal, flushSync } = RD ?? {};
 * export { createRoot, hydrateRoot, createPortal, flushSync };
 * ```
 *
 * Five exports. `@dnd-kit/core` opens with
 * `import { createPortal, unstable_batchedUpdates } from 'react-dom'`, and a
 * named import the module does not export is an ES module *link* error — it
 * fails before a line of either module runs, so there is no try/catch and no
 * fallback path. The host catches it, renders its slot placeholder
 * ("Tickler: Tickler") and the whole plugin is simply gone; `slots.tsx:550`
 * console.errors, which is the only thread to pull.
 *
 * `RD` — the default export — is the host's real `react-dom` namespace, and
 * that has `unstable_batchedUpdates`: React 19 did not remove it, only stopped
 * needing it (its own updates have been batched since 18). So the missing
 * export is a gap in the shim's named list rather than a gap in what the host
 * holds, and re-deriving the names from the default closes it.
 *
 * `esbuild.config.mjs` routes every `react-dom` import in the bundle here with
 * an `onResolve` hook, and leaves this module's own import external so it still
 * reaches the shim. An `alias` cannot do it: alias is applied before plugins,
 * so the line below would be rewritten to this file and import itself.
 *
 * Requested upstream as PLI-261 — a core fix would make this module dead code,
 * not wrong. Until then this is inside our own bundle, which is the whole
 * point: nothing here touches core.
 */
import ReactDOM from "react-dom";

/** The shim's default is the host's `react-dom`; under real `react-dom` it is the module itself. */
const RD = (ReactDOM ?? {}) as Partial<{
  createPortal: unknown;
  createRoot: unknown;
  hydrateRoot: unknown;
  flushSync: unknown;
  unstable_batchedUpdates: <R>(callback: () => R) => R;
}>;

// The shim's four, forwarded verbatim rather than improved on: `createRoot` and
// `hydrateRoot` are `undefined` there — the host bridges `react-dom`, whose
// namespace has neither, while those two live in `react-dom/client` — and
// making them work here would be a second React root, not a fix.
export const createPortal = RD.createPortal;
export const createRoot = RD.createRoot;
export const hydrateRoot = RD.hydrateRoot;
export const flushSync = RD.flushSync;

/**
 * The sixth name. Forwarded when the host has it, which React 19 does; the
 * fallback runs the callback, which is what batching means once React batches
 * on its own.
 */
export const unstable_batchedUpdates: <R>(callback: () => R) => R =
  RD.unstable_batchedUpdates ?? ((callback) => callback());

export default ReactDOM;
