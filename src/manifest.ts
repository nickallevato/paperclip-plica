export const PLUGIN_ID = "nickallevato.plugin-plica";

/**
 * Plica is a UI-only plugin.
 *
 * It contributes one page slot (mounted by the host at `/:companyPrefix/plica`)
 * and one sidebar launcher that navigates there. It declares no capabilities
 * because it registers no agent tools, no API routes, and no database
 * namespace — all of its data comes from ordinary core HTTP APIs called from
 * the browser (PLUGIN_SPEC.md §24).
 */
const manifest = {
  id: PLUGIN_ID,
  name: "Plica",
  version: "0.1.0",
  apiVersion: 1,
  description: "Cross-company HUD: company panes, triage, approvals, attention, and briefing.",
  categories: ["ui"],
  capabilities: [],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    launchers: [
      {
        id: "plica-sidebar-launcher",
        displayName: "Plica",
        placementZone: "sidebar",
        icon: "Telescope",
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
