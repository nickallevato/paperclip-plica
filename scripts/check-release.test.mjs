import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  changelogVersionsIn,
  checkRelease,
  manifestVersionIn,
  versionFromTag,
} from "./check-release.mjs";

/** A release with nothing wrong with it, for each case to spoil one way. */
const ready = {
  packageVersion: "0.6.0",
  manifestVersion: "0.6.0",
  changelogVersions: ["0.6.0", "0.5.0"],
  releaseNotes: ["0.6.0", "0.5.0"],
  tag: "v0.6.0",
};

const rulesOf = (facts) => checkRelease(facts).problems.map((p) => p.rule);

describe("checkRelease", () => {
  it("passes a release whose version is declared the same way everywhere", () => {
    expect(checkRelease(ready)).toMatchObject({ ok: true, version: "0.6.0", problems: [] });
  });

  it("passes without a tag, so the check can run before one is cut", () => {
    expect(checkRelease({ ...ready, tag: "" }).ok).toBe(true);
  });

  it("catches a manifest left on the previous version, which the host would report", () => {
    expect(rulesOf({ ...ready, manifestVersion: "0.5.0" })).toEqual(["manifest-version"]);
  });

  it("catches a tag that names a different version than package.json", () => {
    expect(rulesOf({ ...ready, tag: "v0.6.1" })).toEqual(["tag-version"]);
  });

  it("catches entries still sitting under Unreleased", () => {
    expect(rulesOf({ ...ready, changelogVersions: ["0.5.0"] })).toEqual(["changelog-entry"]);
  });

  it("catches a version nobody wrote a release page for", () => {
    expect(rulesOf({ ...ready, releaseNotes: ["0.5.0"] })).toEqual(["release-notes"]);
  });

  it("reports one problem for a version that is not a version, not four", () => {
    // Every other rule compares against this string, so reporting them all
    // would bury the single typo that caused them.
    expect(rulesOf({ ...ready, packageVersion: "0.6" })).toEqual(["version-shape"]);
  });

  it("accepts a prerelease, which npm does", () => {
    const rc = "0.6.0-rc.1";
    expect(
      checkRelease({ packageVersion: rc, manifestVersion: rc, changelogVersions: [rc], releaseNotes: [rc], tag: `v${rc}` }).ok,
    ).toBe(true);
  });

  it("collects every problem at once, so one push reports the whole list", () => {
    expect(rulesOf({ ...ready, manifestVersion: "0.5.0", releaseNotes: [] })).toEqual([
      "manifest-version",
      "release-notes",
    ]);
  });
});

describe("versionFromTag", () => {
  it("reads the version out of the ref CI hands over", () => {
    expect(versionFromTag("refs/tags/v0.6.0")).toBe("0.6.0");
  });

  it("reads the version out of the tag a person types", () => {
    expect(versionFromTag("v0.6.0")).toBe("0.6.0");
  });
});

describe("changelogVersionsIn", () => {
  it("takes the version headings and leaves the prose ones", () => {
    const text = "# Changelog\n\n## Unreleased\n\n- something\n\n## 0.5.0\n\n## 0.4.0\n";
    expect(changelogVersionsIn(text)).toEqual(["0.5.0", "0.4.0"]);
  });

  it("reads the real changelog, so a reformat of it fails here first", () => {
    const text = readFileSync("CHANGELOG.md", "utf8");
    expect(changelogVersionsIn(text)).toContain("0.5.0");
  });
});

describe("manifestVersionIn", () => {
  it("reads the version literal out of the real manifest", () => {
    // The regex is the price of staying dependency-free against a TypeScript
    // file; this is what notices when the declaration stops looking like that.
    const text = readFileSync("src/manifest.ts", "utf8");
    expect(manifestVersionIn(text)).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("returns empty rather than guessing when there is no version literal", () => {
    expect(manifestVersionIn("const manifest = { id: PLUGIN_ID };\n")).toBe("");
  });
});

describe("the tree as it stands", () => {
  it("declares its own version consistently", () => {
    // The check that matters most: whatever is on disk right now would pass.
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const manifest = manifestVersionIn(readFileSync("src/manifest.ts", "utf8"));
    expect(manifest).toBe(pkg.version);
  });
});
