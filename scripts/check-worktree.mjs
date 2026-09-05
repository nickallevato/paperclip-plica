#!/usr/bin/env node
/**
 * Refuses topic-branch work in the checkout that every agent shares.
 *
 * Paperclip resolves each agent in this company to the same working copy
 * (`PAPERCLIP_WORKSPACE_STRATEGY=project_primary`), so one `HEAD` and one index
 * are shared by everyone running at once. `git checkout` carries uncommitted
 * changes across branches without complaint when they do not conflict, which
 * means one agent switching branches can commit another's edits onto the wrong
 * branch, or a later `checkout -- .` can discard them. Neither agent sees an
 * error. That is the failure mode this guards: silent, not loud.
 *
 * The rule is narrow. Uncommitted work is what gets lost, so the guard fires
 * where uncommitted work accumulates — a commit on a topic branch in the shared
 * tree — and nowhere else. It cannot stop the destructive command itself; git
 * has no pre-checkout hook to hang a veto on. What it can do is keep the shared
 * tree from being where anyone's work lives, so there is nothing there to lose.
 *
 * It only applies to agents sharing a tree. A human clone has exactly one
 * worktree and no `PAPERCLIP_WORKSPACE_CWD` in the environment, and a run given
 * an isolated workspace reports a `PAPERCLIP_WORKSPACE_STRATEGY` other than
 * `project_primary`, so this is a no-op in both.
 *
 * Dependency-free, like the branch-name and plugin-surface checks, so it runs
 * in a git hook with nothing to keep in sync.
 *
 * Usage:
 *   node scripts/check-worktree.mjs
 *
 * Escape hatch, for the deliberate exception:
 *   PLICA_ALLOW_SHARED_CHECKOUT=1 git commit ...
 */

import { execFileSync } from "node:child_process";

/** Branches that are not one agent's in-flight work. */
export const EXEMPT_BRANCHES = new Set(["main"]);

/** The one `PAPERCLIP_WORKSPACE_STRATEGY` that hands every agent the same tree. */
export const SHARED_STRATEGY = "project_primary";

/**
 * Decides whether a commit is allowed, from already-gathered facts.
 *
 * Split out from the git and environment calls so the decision is testable
 * without a fixture repository per case.
 *
 * @param {object} facts
 * @param {boolean} facts.isPaperclipRun    Running inside a Paperclip agent run.
 * @param {boolean} facts.isSharedCheckout  This is the main worktree, not a linked one.
 * @param {string}  facts.branch            Current branch name.
 * @param {string}  [facts.strategy]        `PAPERCLIP_WORKSPACE_STRATEGY`, if set.
 * @param {boolean} [facts.overridden]      `PLICA_ALLOW_SHARED_CHECKOUT` is set.
 * @returns {{ ok: boolean, reason: string }}
 */
export function classifyCheckout({
  isPaperclipRun,
  isSharedCheckout,
  branch,
  strategy = "",
  overridden = false,
}) {
  if (!isPaperclipRun) {
    return { ok: true, reason: "not a Paperclip agent run" };
  }
  // The runtime says which working copy it handed us, and only one of the
  // strategies shares it. Trust that over the shape of the checkout: an
  // isolated workspace is free to be a clone rather than a linked worktree,
  // and blocking every commit in one would be the worse failure.
  if (strategy && strategy !== SHARED_STRATEGY) {
    return { ok: true, reason: `workspace strategy "${strategy}" is not shared` };
  }
  if (!isSharedCheckout) {
    return { ok: true, reason: "linked worktree, private to this run" };
  }
  if (EXEMPT_BRANCHES.has(branch)) {
    return { ok: true, reason: `${branch} is not one agent's in-flight work` };
  }
  if (overridden) {
    return { ok: true, reason: "PLICA_ALLOW_SHARED_CHECKOUT set" };
  }
  return { ok: false, reason: `topic branch "${branch}" in the shared checkout` };
}

/**
 * True in the main worktree, false in one added by `git worktree add`.
 *
 * A linked worktree's `--git-dir` is its own `.git/worktrees/<name>` directory
 * while `--git-common-dir` stays the shared one; in the main worktree the two
 * are the same path. This is the check git itself uses, and unlike matching on
 * the directory name it does not care where the worktree was put.
 */
export function isMainWorktree(git = gitOutput) {
  const dir = git(["rev-parse", "--absolute-git-dir"]);
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return dir === common;
}

/** @param {string[]} args */
function gitOutput(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main() {
  const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]);
  const verdict = classifyCheckout({
    // Only Paperclip sets this, and it is what makes the checkout shared.
    isPaperclipRun: Boolean(process.env.PAPERCLIP_WORKSPACE_CWD),
    isSharedCheckout: isMainWorktree(),
    branch,
    strategy: process.env.PAPERCLIP_WORKSPACE_STRATEGY ?? "",
    overridden: Boolean(process.env.PLICA_ALLOW_SHARED_CHECKOUT),
  });

  if (verdict.ok) {
    console.log(`worktree: ok (${verdict.reason})`);
    return 0;
  }

  console.error(
    `\nThis is the shared checkout, and you are on "${branch}".\n\n` +
      "Every agent in this company resolves to this one working copy. Work left\n" +
      "here is one `git checkout` by another agent away from being committed to\n" +
      "the wrong branch or discarded — with no error shown to either of you.\n\n" +
      "Do your work in your own worktree instead:\n\n" +
      `  git worktree add -b ${branch} ../plica-${branch.split("/")[0]} origin/main\n` +
      `  cd ../plica-${branch.split("/")[0]}\n\n` +
      "It is a full checkout with its own HEAD and index, sharing this one's\n" +
      "object store, and creating it does not move the shared tree's HEAD.\n\n" +
      'See CONTRIBUTING.md, "The shared checkout".\n',
  );
  return 1;
}

// Only run as a CLI, so the decision stays importable from tests.
if (process.argv[1] && process.argv[1].endsWith("check-worktree.mjs")) {
  process.exit(main());
}
