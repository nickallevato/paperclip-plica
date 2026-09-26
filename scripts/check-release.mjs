#!/usr/bin/env node
/**
 * Refuses a release whose version is not declared the same way everywhere.
 *
 * A published npm version can never be reused, so every mistake this catches is
 * permanent once it reaches the registry: a tag that disagrees with
 * `package.json`, a `src/manifest.ts` still on the previous number (the host
 * reads the manifest, `pnpm install` reads the package, and the mismatch is
 * invisible until someone reports the wrong version in `plugin list`), or a
 * version nobody wrote a changelog entry or a release page for.
 *
 * This runs before `npm publish`, not after — see `scripts/publish-npm.mjs`,
 * which is the only thing that publishes and which refuses to when this fails.
 *
 * Dependency-free, like the branch-name, worktree and plugin-surface checks, so
 * it reports even when nothing is installed.
 *
 * Usage:
 *   node scripts/check-release.mjs                        # check the tree as it stands
 *   node scripts/check-release.mjs --tag v0.6.0           # and that a tag agrees
 *   node scripts/check-release.mjs --tag refs/tags/v0.6.0 # same, as CI spells it
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Where each version number is declared, for the messages below. */
const PACKAGE_JSON = "package.json";
const MANIFEST = "src/manifest.ts";
const CHANGELOG = "CHANGELOG.md";
const RELEASES_DIR = "docs/releases";

/** `major.minor.patch`, optionally a prerelease — what npm will accept. */
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Strips the ref and tag decoration off a tag, leaving the bare version.
 *
 * CI hands over `refs/tags/v0.6.0`; a person types `v0.6.0`. Both mean the same
 * release, and neither is the version string `package.json` holds.
 *
 * @param {string} tag
 * @returns {string} The version the tag names, or the input if it names none.
 */
export function versionFromTag(tag) {
  return tag.replace(/^refs\/tags\//, "").replace(/^v/, "");
}

/**
 * Decides whether a release may be published, from already-gathered facts.
 *
 * Split out from the file reads so every rule is testable without a fixture
 * repository per case.
 *
 * @param {object} facts
 * @param {string}   facts.packageVersion    `version` in package.json.
 * @param {string}   facts.manifestVersion   `version` in src/manifest.ts.
 * @param {string[]} facts.changelogVersions Version headings in CHANGELOG.md.
 * @param {string[]} facts.releaseNotes      Versions with a page in docs/releases/.
 * @param {string}   [facts.tag]             Tag being published, if there is one.
 * @returns {{ ok: boolean, version: string, problems: Array<{ rule: string, detail: string }> }}
 */
export function checkRelease({
  packageVersion,
  manifestVersion,
  changelogVersions,
  releaseNotes,
  tag = "",
}) {
  const problems = [];
  const version = packageVersion;

  if (!VERSION_RE.test(packageVersion)) {
    // Nothing downstream means anything if this is not a version, so stop here
    // rather than report four consequences of the same typo.
    problems.push({
      rule: "version-shape",
      detail: `${PACKAGE_JSON} version "${packageVersion}" is not a semver version npm will accept`,
    });
    return { ok: false, version, problems };
  }

  if (manifestVersion !== packageVersion) {
    problems.push({
      rule: "manifest-version",
      detail:
        `${MANIFEST} says "${manifestVersion}", ${PACKAGE_JSON} says "${packageVersion}" — ` +
        "the host reads the manifest, so the two must agree",
    });
  }

  if (tag) {
    const tagged = versionFromTag(tag);
    if (tagged !== packageVersion) {
      problems.push({
        rule: "tag-version",
        detail: `tag ${tag} names version "${tagged}", ${PACKAGE_JSON} says "${packageVersion}"`,
      });
    }
  }

  if (!changelogVersions.includes(packageVersion)) {
    problems.push({
      rule: "changelog-entry",
      detail: `${CHANGELOG} has no "## ${packageVersion}" heading — the entries are still under Unreleased`,
    });
  }

  if (!releaseNotes.includes(packageVersion)) {
    problems.push({
      rule: "release-notes",
      detail: `${RELEASES_DIR}/${packageVersion}.md does not exist — every version gets a page`,
    });
  }

  return { ok: problems.length === 0, version, problems };
}

/**
 * Reads the version headings out of a changelog.
 *
 * `## Unreleased` and any other prose heading are skipped: only headings that
 * are a version count as a released version.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function changelogVersionsIn(text) {
  return text
    .split("\n")
    .map((line) => /^##\s+v?(.+?)\s*$/.exec(line)?.[1])
    .filter((heading) => heading !== undefined && VERSION_RE.test(heading));
}

/**
 * Reads the version declared in `src/manifest.ts`.
 *
 * A regex, not an import: this script stays dependency-free and runnable with
 * nothing installed, and `src/manifest.ts` is TypeScript that Node will not
 * load. The manifest writes its version as a plain literal, and
 * `check:surface` keeps that file inside the plugin, so the shape is stable.
 *
 * @param {string} text
 * @returns {string} The version, or "" when the literal is not found.
 */
export function manifestVersionIn(text) {
  return /^\s*version:\s*"([^"]+)"/m.exec(text)?.[1] ?? "";
}

function readFacts(root, tag) {
  const pkg = JSON.parse(readFileSync(join(root, PACKAGE_JSON), "utf8"));
  const releaseNotes = readdirSync(join(root, RELEASES_DIR))
    .map((file) => /^(.+)\.md$/.exec(file)?.[1])
    .filter((name) => name !== undefined && VERSION_RE.test(name));

  return {
    packageVersion: pkg.version ?? "",
    manifestVersion: manifestVersionIn(readFileSync(join(root, MANIFEST), "utf8")),
    changelogVersions: changelogVersionsIn(readFileSync(join(root, CHANGELOG), "utf8")),
    releaseNotes,
    tag,
  };
}

function main(argv) {
  const tagIdx = argv.indexOf("--tag");
  const tag = tagIdx === -1 ? "" : (argv[tagIdx + 1] ?? "");

  // Every path is resolved from the repository root, so the script works the
  // same from a package script and from a CI step with its own directory.
  const root = new URL("..", import.meta.url).pathname;
  const { ok, version, problems } = checkRelease(readFacts(root, tag));

  if (ok) {
    console.log(`release: ${version} is declared consistently${tag ? ` and matches ${tag}` : ""}`);
    return 0;
  }

  console.error(`\nThis release is not ready to publish as ${version}.\n`);
  for (const problem of problems) {
    console.error(`  ✖ [${problem.rule}] ${problem.detail}`);
  }
  console.error(
    "\nA published version can never be reused, so a wrong one is fixed by the\n" +
      "next release, not by republishing. Fix the declarations and re-tag.\n" +
      'See docs/releases/README.md, "Cutting a release".\n',
  );
  return 1;
}

// Only run as a CLI, so the rules above stay importable from tests.
if (process.argv[1] && process.argv[1].endsWith("check-release.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
