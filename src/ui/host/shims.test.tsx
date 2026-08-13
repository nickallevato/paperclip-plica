import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { buildCompanyPath, mapToneToPluginTone, useDialogActions } from "./shims";
import { TEST_COMPANY_ID, installTestBridge } from "../../test/bridge";

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

  /**
   * The host's new-issue dialog is React state inside DialogContext with no URL
   * that opens it, so plugin UI cannot trigger it. These cover the replacement:
   * navigate to the target company's issues page instead of rendering a button
   * that does nothing.
   */
  describe("useDialogActions().openNewIssue", () => {
    it("navigates in-app for the current company", () => {
      const { navigate } = installTestBridge();
      const assign = vi.fn();
      vi.stubGlobal("location", { ...window.location, assign });

      const { result } = renderHook(() => useDialogActions());
      result.current.openNewIssue({ companyId: TEST_COMPANY_ID, companyPrefix: "ACME" });

      expect(navigate).toHaveBeenCalledWith("/ACME/issues");
      expect(assign).not.toHaveBeenCalled();
    });

    it("does a full document load for a different company", () => {
      const { navigate } = installTestBridge();
      const assign = vi.fn();
      vi.stubGlobal("location", { ...window.location, assign });

      const { result } = renderHook(() => useDialogActions());
      result.current.openNewIssue({ companyId: "company-2", companyPrefix: "OTHER" });

      expect(assign).toHaveBeenCalledWith("/OTHER/issues");
      expect(navigate).not.toHaveBeenCalled();
    });

    it("falls back to the current company prefix when none is given", () => {
      const { navigate } = installTestBridge();
      const { result } = renderHook(() => useDialogActions());
      result.current.openNewIssue({});
      expect(navigate).toHaveBeenCalledWith("/ACME/issues");
    });
  });
});
