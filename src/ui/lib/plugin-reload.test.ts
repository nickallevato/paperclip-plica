import { describe, expect, it } from "vitest";
import { checkPluginReload, compareVersions } from "./plugin-reload";

const BUNDLED = { version: "0.5.0", capabilities: ["ui.page.register", "issues.read"] };

describe("checkPluginReload", () => {
  it("is current when the registered version matches the bundle", () => {
    expect(
      checkPluginReload(BUNDLED, { version: "0.5.0", manifestJson: { capabilities: BUNDLED.capabilities } }),
    ).toEqual({ status: "current" });
  });

  it("offers a reload when the bundle is newer and adds no capabilities", () => {
    expect(
      checkPluginReload(BUNDLED, { version: "0.4.0", manifestJson: { capabilities: BUNDLED.capabilities } }),
    ).toEqual({ status: "reload", installed: "0.4.0", bundled: "0.5.0" });
  });

  it("asks for a reinstall when the bundle adds a capability", () => {
    // The host refuses an in-place upgrade that escalates capabilities.
    expect(
      checkPluginReload(BUNDLED, { version: "0.4.0", manifestJson: { capabilities: ["ui.page.register"] } }),
    ).toEqual({ status: "reinstall", installed: "0.4.0", bundled: "0.5.0", added: ["issues.read"] });
  });

  it("never offers to move backwards to an older cached bundle", () => {
    expect(
      checkPluginReload(BUNDLED, { version: "0.6.0", manifestJson: { capabilities: [] } }),
    ).toEqual({ status: "current" });
  });

  it("stays silent when the record is missing or incomplete", () => {
    expect(checkPluginReload(BUNDLED, null)).toEqual({ status: "unknown" });
    expect(checkPluginReload(BUNDLED, { version: null })).toEqual({ status: "unknown" });
    expect(checkPluginReload(BUNDLED, { version: "0.4.0" })).toEqual({ status: "unknown" });
  });
});

describe("compareVersions", () => {
  it("compares numerically, not lexically", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.4.0-rc.1", "0.4.0")).toBe(0);
    expect(compareVersions("0.3.9", "0.4.0")).toBeLessThan(0);
  });
});
