import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";

export const PLUGIN_ID = "nickallevato.plugin-plica";

/**
 * Plica is a UI-only plugin.
 *
 * It contributes one page slot (mounted by the host at `/:companyPrefix/plica`)
 * and one sidebar launcher that navigates there.
 *
 * The declared capabilities describe the company data the HUD surfaces. They
 * do not gate its reads: capabilities gate worker-side host RPC, and plugin UI
 * may call ordinary Paperclip HTTP APIs directly (PLUGIN_SPEC.md §24). Plica's
 * worker is a no-op, so nothing here is exercised at runtime — the list stands
 * as an honest declaration of what the page displays, and the schema requires
 * at least one entry.
 */
const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Plica",
  description: "Cross-company HUD: company panes, triage, approvals, attention, and briefing.",
  // The manifest schema has no homepage/repository fields — `author` is a plain
  // string — so the links ride inline here, and also live in package.json.
  author: "nickallevato (https://allevato.io · https://github.com/nickallevato)",
  categories: ["ui"],
  capabilities: [
    // Required to register the UI surfaces below. The host validates these
    // separately from the zod schema, in plugin-capability-validator.ts:
    // a `page` slot requires ui.page.register, and a `sidebar` launcher
    // requires ui.sidebar.register.
    "ui.page.register",
    "ui.sidebar.register",
    // Company data the HUD surfaces.
    "companies.read",
    "projects.read",
    "issues.read",
    "agents.read",
    "approvals.read",
    "activity.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "plica-page",
        displayName: "Plica",
        exportName: "PlicaPage",
        routePath: "plica",
      },
      {
        // A slot, not a launcher: the host mounts only PluginSlotOutlet for the
        // sidebarPanel zone, so launchers never render there. A component also
        // gets to draw its own Telescope icon, which launcher declarations
        // cannot — they have no icon field.
        type: "sidebarPanel",
        id: "plica-sidebar-panel",
        displayName: "Plica",
        exportName: "PlicaSidebarPanel",
      },
    ],
  },
};

export default manifest;
