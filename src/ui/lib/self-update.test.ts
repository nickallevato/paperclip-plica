import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NPM_LATEST_URL, NPM_PACKAGE, checkSelfUpdate } from "./self-update";

const npm = (version: string) => ({ version, packagePath: null });

describe("checkSelfUpdate", () => {
  it("offers the published version when it is newer than the registration", () => {
    expect(checkSelfUpdate(npm("0.6.0"), "0.7.1")).toEqual({
      status: "available",
      installed: "0.6.0",
      latest: "0.7.1",
    });
  });

  it("says nothing to do when the registration is the published version", () => {
    expect(checkSelfUpdate(npm("0.7.1"), "0.7.1")).toEqual({ status: "current", installed: "0.7.1" });
  });

  it("does not offer to go backwards when npm is behind the registration", () => {
    // A prerelease installed by hand, or a version unpublished from the registry.
    expect(checkSelfUpdate(npm("0.8.0"), "0.7.1")).toEqual({ status: "current", installed: "0.8.0" });
  });

  it("stands down for a local-path install, whatever npm says", () => {
    // The host's upgrade endpoint re-reads that directory rather than fetching
    // from npm, so a published version is not this install's source of truth.
    expect(checkSelfUpdate({ version: "0.6.0", packagePath: "/srv/tickler" }, "0.7.1")).toEqual({
      status: "local",
      installed: "0.6.0",
    });
  });

  it("is unknown, not current, when npm could not be read", () => {
    expect(checkSelfUpdate(npm("0.7.1"), null)).toEqual({ status: "unknown" });
    expect(checkSelfUpdate(npm("0.7.1"), undefined)).toEqual({ status: "unknown" });
  });

  it("is unknown when there is no registration to compare against", () => {
    expect(checkSelfUpdate(null, "0.7.1")).toEqual({ status: "unknown" });
    expect(checkSelfUpdate({ version: null }, "0.7.1")).toEqual({ status: "unknown" });
  });

  it("reads the registry endpoint that answers with CORS", () => {
    // `/-/package/<pkg>/dist-tags` is smaller but sends no CORS header, so it
    // is unreadable from the page. Keep this on `/<pkg>/latest`.
    expect(NPM_LATEST_URL).toBe(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`);
  });

  it("names the package this repository actually publishes", () => {
    // The Plica → Tickler rename moved this string once already. A stale name
    // here checks a package nobody installs, and the button never appears.
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../../../package.json"), "utf8"));
    expect(NPM_PACKAGE).toBe(pkg.name);
  });
});
