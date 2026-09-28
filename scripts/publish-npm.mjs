#!/usr/bin/env node
/**
 * The one way Tickler reaches the npm registry.
 *
 * Publishing is the only thing this repository does that cannot be undone: a
 * version number is spent the moment it lands, and a bad release is fixed by
 * the next one, never by republishing. So it goes through one script that every
 * caller shares — a person at a terminal, an agent on a release task, and the
 * `release` workflow on a tag all run this, and all get the same refusals:
 *
 *   - the version must be declared the same way everywhere (check-release.mjs),
 *   - the checkout must be clean, and sitting on the tag being published,
 *   - authentication must be explicit about where it came from.
 *
 * `npm publish` itself does the build: `prepublishOnly` typechecks, builds and
 * tests, so a red tree cannot reach the registry and this script does not
 * duplicate that pipeline.
 *
 * Credentials are never written into the repository. A token, when there is
 * one, goes to a private temporary npm config that is deleted before this exits
 * — so a token on the environment cannot be left behind in a stray `.npmrc`
 * for the next run, or for the next agent sharing the machine, to pick up.
 *
 * Usage:
 *   node scripts/publish-npm.mjs --tag v0.6.0    # publish that tag
 *   node scripts/publish-npm.mjs --dry-run       # pack and check, publish nothing
 *
 * Authentication, in the order it is looked for:
 *   a token on the environment   see TOKEN_ENV_NAMES
 *   GitHub Actions OIDC          npm trusted publishing, no token anywhere
 *   ~/.npmrc                     an interactive `npm login`, local runs only
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The registry Tickler publishes to. Named so the token line below can scope to it. */
export const REGISTRY = "https://registry.npmjs.org";

/**
 * Environment variables a token is accepted from, in the order they win.
 *
 * `NPM_TOKEN` is what the `release` workflow passes and what the docs tell a
 * person to set. `NODE_AUTH_TOKEN` is what `actions/setup-node` calls the same
 * thing, so a job written the conventional way also works. The third is how
 * Paperclip delivers the credential to an agent: its secrets are bound under
 * the name they were stored as, and renaming a bound secret is the user's job,
 * not something this script can do — so the script learns the name instead of
 * an agent hand-copying a token between variables.
 */
export const TOKEN_ENV_NAMES = ["NPM_TOKEN", "NODE_AUTH_TOKEN", "NPM_TOKEN_90_DAY_EXP"];

/**
 * Finds the token on an environment, and remembers which variable it came from.
 *
 * The name is carried along because "which credential published this" is the
 * first question asked after a release nobody expected, and three accepted
 * names make "a token was set" too vague an answer.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ token: string, source: string }}
 */
export function resolveEnvToken(env) {
  for (const name of TOKEN_ENV_NAMES) {
    const value = (env[name] ?? "").trim();
    if (value) return { token: value, source: name };
  }
  return { token: "", source: "" };
}

/**
 * Decides how this run authenticates to the registry.
 *
 * Deliberately not a fallback chain that ends in "try it and see". An
 * unauthenticated `npm publish` fails with a 404 that reads like the package
 * does not exist, which has sent more than one person looking for the wrong
 * problem; better to say up front that no credential was found.
 *
 * @param {object} env
 * @param {string} [env.token]          A token from one of TOKEN_ENV_NAMES.
 * @param {string} [env.tokenSource]    Which variable it came from.
 * @param {boolean} [env.oidcAvailable] GitHub Actions issued an OIDC token for this job.
 * @param {boolean} [env.ci]            Running unattended.
 * @returns {{ kind: "token" | "oidc" | "local" | "none", detail: string }}
 */
export function resolveAuth({ token = "", tokenSource = "", oidcAvailable = false, ci = false }) {
  if (token) {
    return {
      kind: "token",
      detail: `npm token from ${tokenSource || "the environment"}`,
    };
  }
  if (oidcAvailable) {
    return {
      kind: "oidc",
      detail: "npm trusted publishing over GitHub Actions OIDC — no token involved",
    };
  }
  if (!ci) {
    return { kind: "local", detail: "whatever `npm login` left in ~/.npmrc" };
  }
  return {
    kind: "none",
    detail:
      `no credential: set a token on one of ${TOKEN_ENV_NAMES.join(", ")} ` +
      "(NPM_TOKEN is the repository secret the release workflow passes), or " +
      "configure this workflow as a trusted publisher for the package on " +
      "npmjs.com and grant the job `id-token: write`",
  };
}

/**
 * What to check after npm refused the publish, given how this run authenticated.
 *
 * npm's own two failures here are both misleading. `ENEEDAUTH` ("you need to
 * authorize this machine") is what a job with an OIDC token gets when the
 * registry refuses the token exchange for any reason at all — nothing is wrong
 * with the machine, and the message is the same whether the package has no
 * trusted publisher or has one that does not match this run, so this hint must
 * not pick one. `E403` ("you may not perform that action with these credentials") is
 * what a read-only token gets, and it reads like an account problem even though
 * the same token authenticates fine and can read the package.
 *
 * Both were hit on the way to 0.6.0. Since `resolveAuth` already knows which
 * credential was used, it can name the one thing to go and look at instead of
 * leaving the reader to guess which of the two they are in.
 *
 * @param {"token" | "oidc" | "local" | "none"} authKind
 * @returns {string} A line to print, or "" when there is nothing specific to say.
 */
export function failureHint(authKind) {
  if (authKind === "token") {
    return (
      "If npm said 403 with these credentials: the token authenticates but is " +
      "not allowed to publish. A read-only or read-scoped token reads the " +
      "package fine and fails only on the write. Reissue it as an Automation " +
      "token, or a granular token with read-and-write on " +
      "paperclip-plugin-tickler, and check it has not expired."
    );
  }
  if (authKind === "oidc") {
    return (
      "If npm said it needs auth: no token was set, so this used trusted " +
      "publishing, and npm refused the exchange. That refusal does not say " +
      "whether the package has no trusted publisher entry or has one that does " +
      "not match this run — including an entry left naming a former repository " +
      "or account name, which stops matching the moment the rename lands. The " +
      "diagnostic below prints npm's own answer and this run's OIDC claims; " +
      "compare them with npmjs.com → the package → Settings → Trusted " +
      "publishers. Or set the NPM_TOKEN secret."
    );
  }
  return "";
}

/**
 * Builds the `npm publish` argument list.
 *
 * `--provenance` is only meaningful where npm can get a signed statement about
 * the build that produced the tarball, which today means a CI runner with an
 * OIDC token; asking for it anywhere else fails rather than degrades.
 *
 * @param {object} opts
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.provenance]
 * @returns {string[]}
 */
export function publishArgs({ dryRun = false, provenance = false } = {}) {
  const args = ["publish"];
  if (provenance) args.push("--provenance");
  if (dryRun) args.push("--dry-run");
  return args;
}

/**
 * Decides whether the checkout is a safe thing to publish from.
 *
 * The tarball is built from the working tree, not from a commit, so an
 * uncommitted edit ships silently and is then impossible to trace back from the
 * published version. Requiring the tag keeps `v0.6.0` on npm and `v0.6.0` in
 * git the same bytes.
 *
 * @param {object} facts
 * @param {boolean} facts.dirty          Tracked files differ from HEAD.
 * @param {string}  [facts.tag]          Tag being published, if there is one.
 * @param {string}  [facts.head]         HEAD commit.
 * @param {string}  [facts.tagCommit]    Commit the tag points at, "" if unknown.
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkCheckout({ dirty, tag = "", head = "", tagCommit = "" }) {
  const problems = [];
  if (dirty) {
    problems.push(
      "the checkout has uncommitted changes — the tarball is packed from the " +
        "working tree, so they would ship unrecorded",
    );
  }
  if (tag && !tagCommit) {
    problems.push(`tag ${tag} does not exist here — create it, or fetch it, before publishing`);
  }
  if (tag && tagCommit && tagCommit !== head) {
    problems.push(
      `HEAD is ${head.slice(0, 8)} but ${tag} points at ${tagCommit.slice(0, 8)} — ` +
        "publish from a checkout of the tag",
    );
  }
  return { ok: problems.length === 0, problems };
}

/** The repository root, so every command below runs against this tree whatever the caller's cwd is. */
const ROOT = new URL("..", import.meta.url).pathname;

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function tagCommitFor(tag) {
  try {
    // `^{commit}` so an annotated tag resolves to what it tags, not to itself.
    return git(["rev-parse", "--verify", "--quiet", `${tag}^{commit}`]);
  } catch {
    return "";
  }
}

/**
 * Writes a private npm config holding the token, and returns its path.
 *
 * `NPM_CONFIG_USERCONFIG` points npm at this instead of `~/.npmrc`, so the
 * token never touches the repository or the home directory, and the caller
 * deletes the file whether the publish succeeded or not.
 */
function writeTokenConfig(token) {
  const dir = mkdtempSync(join(process.env.PAPERCLIP_RUN_SCRATCH_DIR || tmpdir(), "tickler-npm-"));
  const path = join(dir, "npmrc");
  const host = REGISTRY.replace(/^https?:/, "");
  writeFileSync(path, `${host}/:_authToken=${token}\n`, { mode: 0o600 });
  return { path, dir };
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const tagIdx = argv.indexOf("--tag");
  const tag = tagIdx === -1 ? "" : (argv[tagIdx + 1] ?? "");

  const checkout = checkCheckout({
    dirty: git(["status", "--porcelain", "--untracked-files=no"]) !== "",
    tag,
    head: git(["rev-parse", "HEAD"]),
    tagCommit: tag ? tagCommitFor(tag) : "",
  });
  if (!checkout.ok) {
    console.error("\nThis checkout is not a safe thing to publish from.\n");
    for (const problem of checkout.problems) console.error(`  ✖ ${problem}`);
    console.error("");
    return 1;
  }

  // The version rules live in their own script so they can be run, and fail,
  // without anyone being anywhere near the registry.
  const check = ["node", join(ROOT, "scripts/check-release.mjs"), ...(tag ? ["--tag", tag] : [])];
  try {
    execFileSync(check[0], check.slice(1), { cwd: ROOT, stdio: "inherit" });
  } catch {
    return 1;
  }

  const ci = Boolean(process.env.CI);
  // GitHub Actions only sets this when the job asked for `id-token: write`. It
  // is both how trusted publishing authenticates and the only thing that makes
  // `--provenance` possible, whichever credential ends up being used.
  const oidcAvailable = Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  const { token, source } = resolveEnvToken(process.env);
  const auth = resolveAuth({ token, tokenSource: source, oidcAvailable, ci });
  if (auth.kind === "none") {
    console.error(`\nCannot publish: ${auth.detail}\n`);
    return 1;
  }
  console.log(`npm auth: ${auth.detail}`);

  let config;
  try {
    const env = { ...process.env };
    if (auth.kind === "token") {
      config = writeTokenConfig(token);
      env.NPM_CONFIG_USERCONFIG = config.path;
    }
    const args = publishArgs({ dryRun, provenance: oidcAvailable });
    console.log(`npm ${args.join(" ")}${dryRun ? " (nothing will be published)" : ""}`);
    execFileSync("npm", args, { cwd: ROOT, stdio: "inherit", env });
  } catch {
    console.error("\nnpm publish failed. Nothing was released; the version is still free.");
    const hint = failureHint(auth.kind);
    if (hint) console.error(`\n${hint}`);
    console.error("");
    // On the OIDC path npm reports `ENEEDAUTH` and throws away the registry's
    // actual reason, so ask the registry for it instead of leaving the next
    // attempt to guess which half of the configuration is wrong. This publishes
    // nothing, and a failing diagnostic must not change the verdict above.
    if (auth.kind === "oidc") {
      try {
        execFileSync("node", [join(ROOT, "scripts/diagnose-npm-oidc.mjs")], {
          cwd: ROOT,
          stdio: "inherit",
        });
      } catch {
        // Its findings are already on stderr; a non-zero exit only repeats that
        // the publish was refused, which is the branch we are already in.
      }
    }
    return 1;
  } finally {
    if (config) rmSync(config.dir, { recursive: true, force: true });
  }

  return 0;
}

// Only run as a CLI, so the decisions above stay importable from tests.
if (process.argv[1] && process.argv[1].endsWith("publish-npm.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
