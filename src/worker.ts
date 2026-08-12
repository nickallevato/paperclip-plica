/**
 * Plica holds no worker-side logic.
 *
 * All of its data access happens in the browser against core Paperclip HTTP
 * APIs, which plugin UI may call directly (PLUGIN_SPEC.md §24). The host still
 * requires a worker entrypoint, so this satisfies the contract and nothing
 * more. If Plica ever needs privileged server-side work, it grows here and
 * gains the matching capabilities in the manifest.
 */
export default {
  async initialize() {
    return { ok: true };
  },
  async shutdown() {
    return { ok: true };
  },
};
