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

  it("declares a sidebar launcher pointing at that route", () => {
    const launcher = manifest.ui?.launchers?.[0];
    expect(launcher).toMatchObject({
      placementZone: "sidebar",
      action: { type: "navigate", target: "plica" },
    });
  });

  it("declares a ui entrypoint, which the schema requires alongside ui slots", () => {
    expect(manifest.entrypoints.ui).toBeTruthy();
  });

  it("uses a plugin id the schema's id pattern accepts", () => {
    expect(PLUGIN_ID).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
  });
});
