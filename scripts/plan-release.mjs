#!/usr/bin/env node
/**
 * Decides whether what has landed since the last release is worth publishing,
 * and as which version.
 *
 * This is the half of a release that used to be done by hand, and the reason a
 * finished feature could sit on `main` for a week (PLI-249): pushing a `v*` tag
 * has always published unattended, but nothing decided the version or said the
 * tag was due. Nothing here publishes and nothing here writes — it reads the
 * merge subjects since the last tag and reports a plan. `apply-release.mjs`
 * carries the plan out, `release.yml` runs both on a push to `main`.
 *
 * The bump comes from the merge subjects because they already follow
 * conventional commits (`feat(board): …`, `fix(release): …`) and because the
 * repository squash-merges, so one pull request is one subject and the subject
 * is the pull request's title. That is data that already exists and is already
 * reviewed; a `.changeset/` file per pull request would be a second, parallel
 * declaration of the same thing.
 *
 * The prose is not derived. `CHANGELOG.md`'s `## Unreleased` section is written
 * per pull request by whoever wrote the change (CONTRIBUTING.md,
 * "Documentation"), and that text becomes the release page verbatim. Only when
 * a releasing change landed with no entry at all does this fall back to the
 * subjects, which reads thin on purpose — see `--require-notes`, which is what
 * keeps it from happening.
 *
 * Dependency-free, like the branch-name, worktree, release and plugin-surface
 * checks, so it runs on a bare runner before anything is installed.
 *
 * Usage:
 *   node scripts/plan-release.mjs                     # plan HEAD against the last v* tag
 *   node scripts/plan-release.mjs --json              # the plan as JSON
 *   node scripts/plan-release.mjs --github-output     # append the plan to $GITHUB_OUTPUT
 *   node scripts/plan-release.mjs --subject "feat: x" # plan one subject, for a pull request
 *   node scripts/plan-release.mjs --subject "…" --require-notes
 *                                                     # …and fail if it has no changelog entry
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PACKAGE_JSON = "package.json";
const CHANGELOG = "CHANGELOG.md";

/** `type(scope)!: subject` — conventional commits, with the scope and `!` optional. */
const SUBJECT_RE = /^([a-z]+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

/**
 * Which conventional-commit types are worth a version, and which are not.
 *
 * The test is whether a user has anything to read about it, not whether the
 * bundle changed. A refactor, a CI fix or a docs pass all change the tarball
 * and none of them belong on a release page, so they publish nothing — and
 * because they publish nothing, a tidy-up merge does not spend a version
 * number. `chore(release)` is in here too, which is what stops the release
 * commit this tooling writes from planning a release of its own.
 */
export const RELEASING_TYPES = new Map([
  ["feat", "minor"],
  ["fix", "patch"],
  ["perf", "patch"],
  ["revert", "patch"],
]);

/** Ranked so a set of subjects reduces to the largest bump any one of them asks for. */
const LEVEL_RANK = { none: 0, patch: 1, minor: 2, major: 3 };

/**
 * Reads the bump a single merge subject asks for.
 *
 * @param {string} subject
 * @param {string} [body] The commit body, for a `BREAKING CHANGE:` footer.
 * @returns {{ level: "major"|"minor"|"patch"|"none", type: string, description: string }}
 */
export function classifySubject(subject, body = "") {
  const match = SUBJECT_RE.exec(subject.trim());
  if (!match) {
    // Not a conventional subject. Publishing on a guess is the one outcome
    // worse than not publishing, so an unreadable subject releases nothing and
    // is reported as such.
    return { level: "none", type: "", description: subject.trim() };
  }

  const [, type, , bang, description] = match;
  const breaking = bang === "!" || /^BREAKING[ -]CHANGE:/m.test(body);
  if (breaking) return { level: "major", type, description };

  return { level: RELEASING_TYPES.get(type) ?? "none", type, description };
}

/**
 * Reduces a list of commits to the one bump the release needs.
 *
 * @param {Array<{ subject: string, body?: string }>} commits
 * @returns {{ level: "major"|"minor"|"patch"|"none", releasing: Array<{ subject: string, level: string }> }}
 */
export function bumpFor(commits) {
  let level = "none";
  const releasing = [];

  for (const commit of commits) {
    const verdict = classifySubject(commit.subject, commit.body);
    if (verdict.level === "none") continue;
    releasing.push({ subject: commit.subject, level: verdict.level });
    if (LEVEL_RANK[verdict.level] > LEVEL_RANK[level]) level = verdict.level;
  }

  return { level, releasing };
}

/**
 * Applies a bump to a version.
 *
 * Tickler is pre-1.0, and semver says the guarantee a major bump breaks does
 * not exist yet at `0.x` — so a breaking change bumps the minor, the same as a
 * feature. Reaching 1.0.0 is an editorial decision about the plugin being
 * finished, not something a `feat!:` subject gets to make on its own.
 *
 * @param {string} current
 * @param {"major"|"minor"|"patch"} level
 * @returns {string}
 */
export function nextVersion(current, level) {
  const [major, minor, patch] = current.split(".").map((part) => Number(part));

  if (level === "major") {
    return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  }
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Cuts the body of `## Unreleased` out of a changelog.
 *
 * @param {string} text
 * @returns {string} The entries, trimmed; "" when the section is empty.
 */
export function unreleasedBody(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Unreleased\s*$/i.test(line));
  if (start === -1) return "";

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

/**
 * Turns already-gathered facts into a release plan.
 *
 * Split out from the git and file reads so every rule is testable without a
 * fixture repository per case, the same way `check-release.mjs` is.
 *
 * @param {object} facts
 * @param {string} facts.currentVersion  `version` in package.json.
 * @param {Array<{ subject: string, body?: string }>} facts.commits Since the last tag.
 * @param {string} [facts.unreleased]    The `## Unreleased` body, if any.
 * @param {string[]} [facts.existingTags] Tags that already exist, to refuse a repeat.
 * @param {boolean} [facts.oneSubject] The commits are one unmerged pull request title.
 * @returns {{ release: boolean, level: string, version: string, tag: string, notes: string, reasons: string[] }}
 */
export function planRelease({
  currentVersion,
  commits,
  unreleased = "",
  existingTags = [],
  oneSubject = false,
}) {
  const reasons = [];

  if (/-/.test(currentVersion)) {
    // A prerelease is a deliberate, hand-cut state; guessing the next number
    // out of it would be inventing policy nobody asked for.
    return {
      release: false,
      level: "none",
      version: currentVersion,
      tag: "",
      notes: "",
      reasons: [`${PACKAGE_JSON} is at prerelease ${currentVersion} — cut that one by hand`],
    };
  }

  const { level, releasing } = bumpFor(commits);

  if (level === "none") {
    return {
      release: false,
      level,
      version: currentVersion,
      tag: "",
      notes: "",
      reasons: [
        oneSubject
          ? `"${commits[0]?.subject ?? ""}" is not a feat, fix, perf or revert — merging it publishes nothing`
          : commits.length === 0
            ? `nothing has landed since ${currentVersion}`
            : `${commits.length} commit(s) since ${currentVersion}, none of them a feat, fix, perf or revert`,
      ],
    };
  }

  const version = nextVersion(currentVersion, level);
  const tag = `v${version}`;

  if (existingTags.includes(tag)) {
    // Either this run is a replay, or someone tagged by hand. Publishing over a
    // spent version is impossible anyway; say so instead of failing at npm.
    return {
      release: false,
      level,
      version,
      tag,
      notes: "",
      reasons: [`${tag} already exists — ${version} is spent, so this needs a hand`],
    };
  }

  for (const change of releasing) {
    reasons.push(`${change.level}: ${change.subject}`);
  }

  const notes = unreleased || releasing.map((change) => `- ${change.subject}`).join("\n");
  if (!unreleased) {
    reasons.push(
      `${CHANGELOG} has no Unreleased entries — the release page falls back to the merge subjects`,
    );
  }

  return { release: true, level, version, tag, notes, reasons };
}

/** The repository root, so every path resolves the same from a package script or a CI step. */
const ROOT = new URL("..", import.meta.url).pathname;

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

/**
 * The newest `v*` tag reachable from HEAD, or "" when there is none.
 *
 * Sorted by version rather than by date: a tag pushed late for an old release
 * must not look like the latest one.
 */
function lastReleaseTag() {
  const tags = git(["tag", "--list", "v*", "--merged", "HEAD", "--sort=-v:refname"]);
  return tags ? tags.split("\n")[0] : "";
}

/** The commits after `since` (or the whole history), subject and body each. */
function commitsSince(since) {
  const range = since ? `${since}..HEAD` : "HEAD";
  const log = git(["log", range, "--format=%s%x00%b%x01"]);
  return log
    .split("\x01")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject, body = ""] = entry.split("\x00");
      return { subject: subject.trim(), body: body.trim() };
    });
}

function readFacts({ subject }) {
  const pkg = JSON.parse(readFileSync(join(ROOT, PACKAGE_JSON), "utf8"));
  const unreleased = unreleasedBody(readFileSync(join(ROOT, CHANGELOG), "utf8"));

  // `--subject` plans a pull request that has not merged yet: the repository
  // squash-merges, so the one subject that will land is the pull request title,
  // and the branch's own commits are not what `main` will see.
  const commits = subject ? [{ subject, body: "" }] : commitsSince(lastReleaseTag());

  return {
    currentVersion: pkg.version ?? "",
    commits,
    unreleased,
    existingTags: git(["tag", "--list", "v*"]).split("\n").filter(Boolean),
    oneSubject: Boolean(subject),
  };
}

function main(argv) {
  const subjectIdx = argv.indexOf("--subject");
  const subject = subjectIdx === -1 ? "" : (argv[subjectIdx + 1] ?? "");
  const requireNotes = argv.includes("--require-notes");

  const plan = planRelease(readFacts({ subject }));

  if (argv.includes("--json")) {
    console.log(JSON.stringify(plan, null, 2));
  } else if (plan.release) {
    console.log(`release: ${plan.level} — publish ${plan.version} as ${plan.tag}`);
    for (const reason of plan.reasons) console.log(`  · ${reason}`);
  } else {
    console.log(`release: none — staying on ${plan.version}`);
    for (const reason of plan.reasons) console.log(`  · ${reason}`);
  }

  if (argv.includes("--github-output") && process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `release=${plan.release}\nlevel=${plan.level}\nversion=${plan.version}\ntag=${plan.tag}\n`,
    );
  }

  // The nag half of PLI-251: a merge publishes now, so a releasing change with
  // no changelog entry no longer means a thin page someone fixes before
  // tagging — it means a thin page that is already on npm. This is the only
  // moment it is still cheap to fix, so the pull request says so.
  if (requireNotes && plan.release && !unreleasedBody(readFileSync(join(ROOT, CHANGELOG), "utf8"))) {
    console.error(
      `\nMerging this will publish ${plan.version}, and ${CHANGELOG} has no entry under\n` +
        "**Unreleased** for it — so the release page would be this pull request's title\n" +
        "and nothing else.\n\n" +
        "Add the entry in this pull request. It is what readers get: the Unreleased\n" +
        "body becomes docs/releases/<version>.md verbatim when the merge publishes.\n\n" +
        'See CONTRIBUTING.md, "Documentation", and docs/releases/README.md.\n',
    );
    return 1;
  }

  return 0;
}

// Only run as a CLI, so the rules above stay importable from tests.
if (process.argv[1] && process.argv[1].endsWith("plan-release.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
