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
  version: "0.2.0",
  displayName: "Plica",
  description: "Cross-company HUD: company panes, triage, approvals, attention, and briefing.",
  // The manifest schema has no homepage/repository fields — `author` is a plain
  // string — so the links ride inline here, and also live in package.json.
  author: "nickallevato (https://allevato.io · https://github.com/nickallevato)",
  categories: ["ui"],
  capabilities: [
    // Required to register the UI surfaces below. The host validates these
    // separately from the zod schema, in plugin-capability-validator.ts:
    // a `page` slot requires ui.page.register, and a `globalToolbarButton`
    // slot requires ui.action.register.
    "ui.page.register",
    "ui.action.register",
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
        // The BreadcrumbBar zone, which Layout renders above every page — the
        // only outlet outside a company's sidebar, which suits a view that
        // spans companies.
        //
        // A slot rather than a launcher: launcher declarations carry no icon
        // field, so a launcher here would render a bare label. Slot components
        // draw their own markup, which is how the Telescope icon survives.
        type: "globalToolbarButton",
        id: "plica-toolbar-button",
        displayName: "Plica",
        exportName: "PlicaToolbarButton",
      },
    ],
  },
};

export default manifest;
