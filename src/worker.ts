import { runWorker } from "@paperclipai/plugin-sdk";
import { plugin } from "./plugin.js";

/**
 * Worker entrypoint.
 *
 * `runWorker` starts the JSON-RPC-over-stdio host and keeps the process alive.
 * Exporting a bare lifecycle object is NOT sufficient — the process would run
 * to completion and exit immediately, and the host reports that as
 * "Worker process exited (code=0, signal=null)" during initialize.
 */
export default plugin;
runWorker(plugin, import.meta.url);
