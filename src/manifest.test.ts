import { describe, expect, it } from "vitest";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import manifest, { PLUGIN_ID } from "./manifest";

/**
 * Validates the manifest against the host's own zod schema.
 *
 * The first install attempt failed at runtime with "displayName: Required;
 * author: Required; capabilities: Array must contain at least 1 element(s)" —
 * a hand-written manifest that TypeScript alone did not catch. Running the real
 * schema here turns that class of failure into a test failure instead of a
 * round trip through the running instance.
 */
describe("plugin manifest", () => {
  it("satisfies the host's plugin manifest v1 schema", () => {
    const result = pluginManifestV1Schema.safeParse(manifest);
    if (!result.success) {
      throw new Error(
        `Manifest failed host validation:\n${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("declares the page slot the host mounts at /:companyPrefix/plica", () => {
    const page = manifest.ui?.slots?.find((slot) => slot.type === "page");
    expect(page).toMatchObject({ routePath: "plica", exportName: "PlicaPage" });
  });

  it("declares the sidebar entry as a slot, not a launcher", () => {
    // The host mounts only PluginSlotOutlet for the sidebarPanel zone — a
    // launcher declared there would never render.
    const panel = manifest.ui?.slots?.find((slot) => slot.type === "sidebarPanel");
    expect(panel).toMatchObject({ exportName: "PlicaSidebarPanel" });
    expect(manifest.ui?.launchers ?? []).toHaveLength(0);
  });

  it("declares a ui entrypoint, which the schema requires alongside ui slots", () => {
    expect(manifest.entrypoints.ui).toBeTruthy();
  });

  it("uses a plugin id the schema's id pattern accepts", () => {
    expect(PLUGIN_ID).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
  });

  /**
   * The host enforces UI capabilities in a SECOND place, outside the zod
   * schema: server/src/services/plugin-capability-validator.ts. A manifest can
   * pass `pluginManifestV1Schema` and still be rejected at install with
   * "manifest has inconsistent capabilities and features" — which is exactly
   * what happened on the second install attempt.
   *
   * These mappings mirror UI_SLOT_CAPABILITIES and
   * LAUNCHER_PLACEMENT_CAPABILITIES from that file. They are deliberately
   * copied rather than imported: importing would bind this suite to
   * `server/dist` build output inside the Paperclip checkout, which is the
   * coupling this whole migration removes. Re-sync from that file if the host
   * adds surfaces.
   */
  const SLOT_CAPABILITIES: Record<string, string> = {
    page: "ui.page.register",
    sidebar: "ui.sidebar.register",
    sidebarPanel: "ui.sidebar.register",
    routeSidebar: "ui.sidebar.register",
    projectSidebarItem: "ui.sidebar.register",
    detailTab: "ui.detailTab.register",
    taskDetailView: "ui.detailTab.register",
    dashboardWidget: "ui.dashboardWidget.register",
    globalToolbarButton: "ui.action.register",
    toolbarButton: "ui.action.register",
    contextMenuItem: "ui.action.register",
    commentContextMenuItem: "ui.action.register",
    commentAnnotation: "ui.commentAnnotation.register",
    settingsPage: "instance.settings.register",
    companySettingsPage: "instance.settings.register",
  };

  it("declares the capability each UI slot requires", () => {
    for (const slot of manifest.ui?.slots ?? []) {
      const required = SLOT_CAPABILITIES[slot.type];
      expect(required, `no known capability for slot type "${slot.type}"`).toBeTruthy();
      expect(
        manifest.capabilities,
        `slot "${slot.id}" (${slot.type}) requires capability "${required}"`,
      ).toContain(required);
    }
  });

  it("declares the capability each launcher placement zone requires", () => {
    for (const launcher of manifest.ui?.launchers ?? []) {
      const required = SLOT_CAPABILITIES[launcher.placementZone];
      expect(
        required,
        `no known capability for placement zone "${launcher.placementZone}"`,
      ).toBeTruthy();
      expect(
        manifest.capabilities,
        `launcher "${launcher.id}" (${launcher.placementZone}) requires capability "${required}"`,
      ).toContain(required);
    }
  });
});
