#!/usr/bin/env node
/**
 * Checks a branch name against the convention in CONTRIBUTING.md, "Branches".
 *
 * The point is not tidiness. A branch named for the issue it closes is how
 * someone reading `git log` a year from now finds the discussion that explains
 * a change, and how a reviewer picking up a stack of agent-opened pull requests
 * can tell at a glance which one is the bug fix.
 *
 * Dependency-free, like the plugin-surface checker, so it runs in CI before
 * anything is installed and in a git hook with nothing to keep in sync.
 *
 * Usage:
 *   node scripts/check-branch-name.mjs             # the current branch
 *   node scripts/check-branch-name.mjs <name>      # a name passed in
 */

import { execFileSync } from "node:child_process";

/**
 * `<prefix>/<kebab-slug>`.
 *
 * The prefix is either the issue key the branch closes (`pli-4`) or a
 * conventional-commit type when there is no issue — a typo fix does not need a
 * ticket. The slug is lowercase kebab-case so the name survives a
 * case-insensitive filesystem unchanged.
 */
export const BRANCH_PATTERN =
  /^(pli-[0-9]+|feat|fix|docs|chore|refactor|perf|test|ci|build|revert)\/[a-z0-9]+(-[a-z0-9]+)*$/;

/** Branches that are not topic branches and so are not held to the pattern. */
export const EXEMPT = new Set(["main", "HEAD"]);

/** @param {string} name */
export function isValidBranchName(name) {
  if (EXEMPT.has(name)) return true;
  // Dependabot and other bots name their own branches; we do not control them.
  if (name.startsWith("dependabot/")) return true;
  return BRANCH_PATTERN.test(name);
}

function currentBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function main(argv) {
  const name = argv[0] || currentBranch();

  if (isValidBranchName(name)) {
    console.log(`branch name: "${name}" ok`);
    return 0;
  }

  console.error(
    `\nBranch name "${name}" does not follow the convention.\n\n` +
      "  <issue-key|type>/<kebab-slug>\n\n" +
      "  pli-4/pr-workflow-and-review-gate    closes PLI-4\n" +
      "  fix/board-row-overflow               no issue, a conventional-commit type\n\n" +
      "Prefixes: pli-<n>, feat, fix, docs, chore, refactor, perf, test, ci,\n" +
      "build, revert. The slug is lowercase kebab-case.\n\n" +
      "Rename it and force-push:\n\n" +
      "  git branch -m <new-name>\n" +
      "  git push origin -u <new-name>\n\n" +
      'See CONTRIBUTING.md, "Branches".\n',
  );
  return 1;
}

// Only run as a CLI, so the pattern stays importable from tests.
if (process.argv[1] && process.argv[1].endsWith("check-branch-name.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
