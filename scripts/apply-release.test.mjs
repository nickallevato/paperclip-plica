import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  bumpManifest,
  bumpPackageJson,
  indexRelease,
  releasePage,
  rollChangelog,
  summaryFrom,
} from "./apply-release.mjs";

describe("bumpPackageJson", () => {
  it("sets the top-level version and touches nothing else", () => {
    const before = '{\n  "name": "x",\n  "version": "0.8.0",\n  "type": "module"\n}\n';
    expect(bumpPackageJson(before, "0.9.0")).toBe(
      '{\n  "name": "x",\n  "version": "0.9.0",\n  "type": "module"\n}\n',
    );
  });

  it("leaves a nested version alone", () => {
    // A dependency pin is not the package's version.
    const before = '{\n  "version": "0.8.0",\n  "deps": {\n    "version": "1.2.3"\n  }\n}\n';
    expect(bumpPackageJson(before, "0.9.0")).toContain('"version": "1.2.3"');
    expect(bumpPackageJson(before, "0.9.0")).toContain('  "version": "0.9.0"');
  });

  it("rewrites the real package.json to a version check-release would accept", () => {
    // Read from the repository root: vitest runs there, and `import.meta.url`
    // inside a transformed module is not a file URL.
    const text = readFileSync("package.json", "utf8");
    expect(JSON.parse(bumpPackageJson(text, "9.9.9")).version).toBe("9.9.9");
  });
});

describe("bumpManifest", () => {
  it("sets the manifest version literal", () => {
    const before = 'export const manifest = {\n  id: "tickler",\n  version: "0.8.0",\n};\n';
    expect(bumpManifest(before, "0.9.0")).toContain('version: "0.9.0"');
  });

  it("leaves the real manifest readable by the same regex check-release uses", () => {
    const text = readFileSync("src/manifest.ts", "utf8");
    const bumped = bumpManifest(text, "9.9.9");
    expect(/^\s*version:\s*"([^"]+)"/m.exec(bumped)?.[1]).toBe("9.9.9");
  });
});

describe("rollChangelog", () => {
  const before = [
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "- **A thing.** It happened.",
    "",
    "## 0.8.0",
    "",
    "- old",
    "",
  ].join("\n");

  it("renames Unreleased to the version and opens a fresh one above it", () => {
    const after = rollChangelog(before, "0.9.0");
    expect(after).toContain("## Unreleased\n\n## 0.9.0\n\n- **A thing.** It happened.");
    expect(after).toContain("## 0.8.0");
  });

  it("is idempotent, so a re-run cannot stack two headings for one release", () => {
    const once = rollChangelog(before, "0.9.0");
    expect(rollChangelog(once, "0.9.0")).toBe(once);
  });

  it("still opens the heading when there are no entries", () => {
    const empty = "# Changelog\n\n## Unreleased\n\n## 0.8.0\n";
    expect(rollChangelog(empty, "0.9.0")).toContain("## Unreleased\n\n## 0.9.0\n\n## 0.8.0");
  });
});

describe("summaryFrom", () => {
  it("joins the bold lead of each entry, lowercased and without its full stop", () => {
    const notes = [
      "- **The left rail spends the height it has.** Long explanation.",
      "- **Tickler updates itself from a button.** More.",
    ].join("\n");
    expect(summaryFrom(notes)).toBe(
      "the left rail spends the height it has; tickler updates itself from a button",
    );
  });

  it("is empty when the entries do not lead with a bold sentence", () => {
    expect(summaryFrom("- a plain entry\n- another")).toBe("");
  });
});

describe("indexRelease", () => {
  const index = ["# Release notes", "", "Intro prose.", "", "- [0.8.0](0.8.0.md) — old.", "- 0.2.0 — the board.", ""].join("\n");

  it("puts the version at the top of the list, newest first", () => {
    const after = indexRelease(index, "0.9.0", "a thing");
    expect(after).toContain("- [0.9.0](0.9.0.md) — a thing.\n- [0.8.0](0.8.0.md)");
  });

  it("omits the dash when there is no summary", () => {
    expect(indexRelease(index, "0.9.0", "")).toContain("- [0.9.0](0.9.0.md)\n- [0.8.0]");
  });

  it("is idempotent", () => {
    const once = indexRelease(index, "0.9.0", "a thing");
    expect(indexRelease(once, "0.9.0", "a thing")).toBe(once);
  });

  it("leaves the intro prose above the list alone", () => {
    expect(indexRelease(index, "0.9.0", "a thing")).toMatch(/^# Release notes\n\nIntro prose\./);
  });
});

describe("releasePage", () => {
  it("carries the notes and links the changelog heading's own anchor", () => {
    const page = releasePage({ version: "0.9.0", notes: "- **A thing.**", date: "2026-09-29" });
    expect(page).toContain("# Tickler 0.9.0");
    expect(page).toContain("Released 2026-09-29");
    expect(page).toContain("- **A thing.**");
    expect(page).toContain("../../CHANGELOG.md#090");
  });
});
