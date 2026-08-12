import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCompanyPath, mapToneToPluginTone } from "./shims";

describe("host/shims", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("buildCompanyPath", () => {
    it("joins prefix and path", () => {
      expect(buildCompanyPath("acme", "plica")).toBe("/acme/plica");
    });

    it("tolerates a leading slash on the path", () => {
      expect(buildCompanyPath("acme", "/issues/PAP-1")).toBe("/acme/issues/PAP-1");
    });

    it("returns a root-relative path when there is no prefix", () => {
      expect(buildCompanyPath(null, "issues")).toBe("/issues");
    });
  });

  describe("mapToneToPluginTone", () => {
    it("passes through the shared tone vocabulary unchanged", () => {
      // Host ToastTone and SDK PluginToastTone are the same four values, so the
      // mapping is identity. This test exists to fail loudly if either side
      // adds or renames a tone.
      expect(mapToneToPluginTone("info")).toBe("info");
      expect(mapToneToPluginTone("success")).toBe("success");
      expect(mapToneToPluginTone("warn")).toBe("warn");
      expect(mapToneToPluginTone("error")).toBe("error");
    });

    it("defaults to info when no tone is given", () => {
      expect(mapToneToPluginTone(undefined)).toBe("info");
    });
  });
});
