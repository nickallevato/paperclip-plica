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
  author: "Northwind Partners Consulting",
  categories: ["ui"],
  capabilities: [
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
    launchers: [
      {
        // Launcher declarations carry no icon field, so the host renders its
        // own default glyph. The customization's Telescope icon cannot be
        // reproduced through the plugin API.
        id: "plica-sidebar-launcher",
        displayName: "Plica",
        description: "Cross-company HUD",
        placementZone: "sidebar",
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
