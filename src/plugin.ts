import { definePlugin } from "@paperclipai/plugin-sdk";

/**
 * Plica's worker lifecycle.
 *
 * Plica is a UI-only plugin: the HUD calls core Paperclip HTTP APIs directly
 * from the browser (PLUGIN_SPEC.md §24), so there is no worker-side data path
 * and no tools, jobs, or API routes to register. The host still starts a worker
 * process per installed plugin and probes its health, so this exists to satisfy
 * that contract.
 *
 * Kept separate from `worker.ts` so it can be imported by tests without
 * `runWorker()` taking over stdio and starting the JSON-RPC host.
 */
export const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Plica plugin worker ready (UI-only; no worker-side data path)");
  },

  async onHealth() {
    return {
      status: "ok" as const,
      message: "Plica plugin worker is running",
      details: { surfaces: ["page", "sidebar"] },
    };
  },
});

export default plugin;
