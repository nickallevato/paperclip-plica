#!/usr/bin/env node
/**
 * Writes a version into the tree, so that the commit it produces is a release.
 *
 * Everything here was a step of "Cutting a release" in docs/releases/README.md
 * that someone did by hand and, once, forgot to do at all (PLI-249): the two
 * version declarations, the changelog heading, the release page, the index
 * entry. `plan-release.mjs` decides the number; this applies it; `release.yml`
 * runs the pair on a push to `main` and then `check-release.mjs` refuses the
 * result if any of it disagrees. A person can still run it by hand — it is the
 * same script either way, which is the only way the hand path stays working.
 *
 * It edits by regular expression rather than by parsing and re-emitting.
 * `package.json` re-serialised by `JSON.stringify` would reorder nothing but
 * reformat everything, and `CHANGELOG.md` is prose whose shape is the point. A
 * release commit should be readable as a diff of five lines plus a new page.
 *
 * Dependency-free, like its siblings, and idempotent: applying the version the
 * tree already declares changes nothing and succeeds.
 *
 * Usage:
 *   node scripts/apply-release.mjs --version 0.9.0
 *   node scripts/apply-release.mjs --version 0.9.0 --date 2026-09-29
 *   node scripts/apply-release.mjs --version 0.9.0 --dry-run
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { unreleasedBody } from "./plan-release.mjs";

const PACKAGE_JSON = "package.json";
const MANIFEST = "src/manifest.ts";
const CHANGELOG = "CHANGELOG.md";
const RELEASES_DIR = "docs/releases";
const RELEASES_INDEX = "docs/releases/README.md";

/**
 * Sets `version` in package.json.
 *
 * Anchored to the top-level two-space indent so a `version` inside a nested
 * object — a dependency pin, say — cannot be hit instead.
 *
 * @param {string} text
 * @param {string} version
 * @returns {string}
 */
export function bumpPackageJson(text, version) {
  return text.replace(/^(  "version":\s*)"[^"]*"/m, `$1"${version}"`);
}

/**
 * Sets `version` in src/manifest.ts.
 *
 * The same literal `check-release.mjs` reads, and for the same reason it reads
 * it with a regex: this script must run with nothing installed, and the file is
 * TypeScript that Node will not load.
 *
 * @param {string} text
 * @param {string} version
 * @returns {string}
 */
export function bumpManifest(text, version) {
  return text.replace(/^(\s*version:\s*)"[^"]*"/m, `$1"${version}"`);
}

/**
 * Renames `## Unreleased` to the version and opens a fresh, empty Unreleased
 * above it.
 *
 * Idempotent: a changelog that already has a `## <version>` heading is returned
 * untouched, so a re-run cannot stack two headings for one release.
 *
 * @param {string} text
 * @param {string} version
 * @returns {string}
 */
export function rollChangelog(text, version) {
  // `[ \t]*$`, not `\s*$`: with the `m` flag `\s` matches the newline, so the
  // lazy-looking version would swallow the blank line after the heading and
  // paste the entries onto it.
  if (new RegExp(`^##[ \t]+v?${version.replace(/\./g, "\\.")}[ \t]*$`, "m").test(text)) return text;

  return text.replace(/^##[ \t]+Unreleased[ \t]*$/im, `## Unreleased\n\n## ${version}`);
}

/**
 * The one-line summary for the release index, read out of the changelog entries.
 *
 * The entries lead with a bold sentence naming the change — that sentence is
 * already the summary someone wrote, so the index reuses it rather than
 * inventing a worse one from the commit subjects.
 *
 * @param {string} notes The Unreleased body.
 * @returns {string} "" when the entries are not in that shape.
 */
export function summaryFrom(notes) {
  const leads = [...notes.matchAll(/^-\s+\*\*(.+?)\*\*/gm)].map(([, lead]) =>
    lead.replace(/\.$/, ""),
  );
  if (leads.length === 0) return "";

  const first = leads[0].charAt(0).toLowerCase() + leads[0].slice(1);
  const rest = leads.slice(1).map((lead) => lead.charAt(0).toLowerCase() + lead.slice(1));
  return [first, ...rest].join("; ");
}

/**
 * The reader-facing page for a version.
 *
 * Generated from the changelog entries, which are written per pull request by
 * whoever wrote the change — so this is the author's own prose moved, not a
 * summary of it. It is still a flatter page than one written for the release as
 * a whole (compare 0.8.0), and it says so: a release publishes on merge now, so
 * the page cannot be the thing the release waits for. Editing it afterwards is
 * free — `docs/` is not in the published tarball.
 *
 * @param {object} args
 * @param {string} args.version
 * @param {string} args.notes The Unreleased body, or a fallback list of subjects.
 * @param {string} args.date  ISO date, for the heading line.
 * @returns {string}
 */
export function releasePage({ version, notes, date }) {
  return `# Tickler ${version}

Released ${date}, by the merge that finished it. The entries below are this
version's [changelog](../../CHANGELOG.md#${version.replace(/\./g, "")}) entries,
written alongside the changes they describe. Anything worth a longer write-up
belongs on this page, added after the fact — \`docs/\` is not in the published
package, so editing it later costs nothing.

${notes}
`;
}

/**
 * Puts the version at the top of the release index's list.
 *
 * Idempotent: an index that already links the version is returned untouched.
 *
 * @param {string} text
 * @param {string} version
 * @param {string} summary The one-liner, or "" for none.
 * @returns {string}
 */
export function indexRelease(text, version, summary) {
  const link = `[${version}](${version}.md)`;
  if (text.includes(link)) return text;

  const bullet = summary ? `- ${link} — ${summary}.` : `- ${link}`;
  // The list is newest-first and starts at the first bullet after the intro, so
  // inserting before that bullet keeps the order without knowing what is in it.
  return text.replace(/^- \[/m, `${bullet}\n- [`);
}

const ROOT = new URL("..", import.meta.url).pathname;

function main(argv) {
  const versionIdx = argv.indexOf("--version");
  const version = versionIdx === -1 ? "" : (argv[versionIdx + 1] ?? "");
  const dateIdx = argv.indexOf("--date");
  const date = dateIdx === -1 ? new Date().toISOString().slice(0, 10) : (argv[dateIdx + 1] ?? "");
  const dryRun = argv.includes("--dry-run");

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error(`apply-release: --version must be a semver version, got "${version}"`);
    return 1;
  }

  const read = (path) => readFileSync(join(ROOT, path), "utf8");
  const changelog = read(CHANGELOG);
  // Read the notes before rolling the heading, or there is no Unreleased body
  // left to read.
  const notes = unreleasedBody(changelog) || `- No changelog entries were written for ${version}.`;

  const writes = new Map([
    [PACKAGE_JSON, bumpPackageJson(read(PACKAGE_JSON), version)],
    [MANIFEST, bumpManifest(read(MANIFEST), version)],
    [CHANGELOG, rollChangelog(changelog, version)],
    [RELEASES_INDEX, indexRelease(read(RELEASES_INDEX), version, summaryFrom(notes))],
  ]);

  const page = `${RELEASES_DIR}/${version}.md`;
  // Never overwrite a page: a hand-written one for this version is better than
  // anything generated, and a re-run must not throw it away.
  if (!existsSync(join(ROOT, page))) {
    writes.set(page, releasePage({ version, notes, date }));
  }

  for (const [path, content] of writes) {
    if (dryRun) {
      console.log(`apply-release: would write ${path}`);
      continue;
    }
    writeFileSync(join(ROOT, path), content);
    console.log(`apply-release: wrote ${path}`);
  }

  console.log(
    `apply-release: ${version} applied${dryRun ? " (dry run, nothing written)" : ""} — ` +
      "run `pnpm check:release` before tagging",
  );
  return 0;
}

// Only run as a CLI, so the edits above stay importable from tests.
if (process.argv[1] && process.argv[1].endsWith("apply-release.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
