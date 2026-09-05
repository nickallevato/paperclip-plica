#!/usr/bin/env node
/**
 * Enforces the one rule Plica cannot break: it never modifies Paperclip core.
 *
 * Plica is a plugin. Everything it does has to go through a documented plugin
 * extension point, inside this repository. Reaching into a Paperclip checkout,
 * patching a core package, or vendoring core source outside the one sanctioned
 * mirror (`src/ui/host/`) is out of bounds — see CONTRIBUTING.md, "Never modify
 * Paperclip core".
 *
 * Dependency-free on purpose. `pnpm install` cannot run in CI: the
 * `@paperclipai/*` dev dependencies are `link:` references to a local Paperclip
 * checkout that does not exist on a runner. This script is plain Node against
 * plain `git`, so the guardrail runs even when nothing else can.
 *
 * There is deliberately no bypass token, no `--force`, no skip label. If the
 * plugin surface genuinely cannot express what a change needs, that is a core
 * limitation to file for the user to decide on, not a check to switch off.
 *
 * Usage:
 *   node scripts/check-plugin-surface.mjs                 # changed vs origin/main
 *   node scripts/check-plugin-surface.mjs --base <ref>    # changed vs <ref>
 *   node scripts/check-plugin-surface.mjs --all           # every tracked file
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Directories a change may touch. Anything outside this list is, by
 * construction, not part of the plugin: a new top-level directory is how a
 * vendored core tree or a patch directory would arrive.
 */
export const ALLOWED_DIRS = [
  ".github/",
  ".githooks/",
  "docs/",
  "scripts/",
  "src/",
];

/** Root-level files a change may touch. Repo configuration and docs only. */
export const ALLOWED_ROOT_FILES = [
  ".gitignore",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "esbuild.config.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vitest.config.ts",
  "vitest.setup.ts",
];

/**
 * Paths that are refused wherever they appear, allowlist or not.
 *
 * `patches/` and `*.patch` are how `patch-package` and `pnpm patch` ship a
 * modified copy of somebody else's package; a top-level `paperclip/` or a
 * `vendor/` tree is how a core checkout gets committed here.
 */
const FORBIDDEN_PATHS = [
  { re: /(^|\/)patches\//, why: "patch directory — patching a dependency's source" },
  { re: /\.(patch|diff|rej|orig)$/, why: "patch/diff artifact" },
  { re: /^paperclip(-core)?\//, why: "a Paperclip core checkout committed into the plugin" },
  { re: /(^|\/)vendor\//, why: "vendored third-party source tree" },
  { re: /(^|\/)node_modules\//, why: "committed dependency source" },
  {
    re: /^packages\/(plugins\/sdk|shared)\//,
    why: "a copy of a Paperclip core package",
  },
];

/**
 * Extensions worth scanning the contents of — things that execute or configure.
 * Markdown is excluded: prose describing the rule is not the rule being broken,
 * and CONTRIBUTING.md names every banned tool by design.
 */
const TEXT_EXT = /\.(mjs|cjs|js|jsx|ts|tsx|json|ya?ml|sh|toml)$/;

/** The only `link:`/`file:` dependencies allowed — the SDK surface itself. */
const ALLOWED_LOCAL_DEPS = new Set(["@paperclipai/plugin-sdk", "@paperclipai/shared"]);

/**
 * Tooling whose entire purpose is rewriting a dependency's installed source.
 * Presence anywhere in a tracked file is the violation; there is no
 * configuration of these that stays inside the plugin surface.
 */
const PATCH_TOOLING = [
  { re: /\bpatch-package\b/, why: "patch-package rewrites installed dependency source" },
  { re: /\bpatchedDependencies\b/, why: "pnpm patchedDependencies rewrites installed dependency source" },
  { re: /\bpnpm\s+patch(-commit)?\b/, why: "`pnpm patch` rewrites installed dependency source" },
  { re: /\bapply-?patch\b/i, why: "patch application step" },
];

/** Node filesystem APIs that write. A read of the host bundle is fine; a write is not. */
const WRITE_CALL =
  /\b(writeFileSync|writeFile|appendFileSync|appendFile|rmSync|unlinkSync|unlink|rmdirSync|mkdirSync|cpSync|copyFileSync|renameSync|createWriteStream|truncateSync)\s*\(/;

/**
 * Things that, on the same line as a write call, mean the write is aimed
 * outside this repository: a parent traversal, a home directory, or a path
 * naming Paperclip itself.
 */
const ESCAPING_TARGET = [
  { re: /\.\.\//, why: "writes above the repository root" },
  { re: /\bhomedir\s*\(/, why: "writes into the user's home directory" },
  { re: /["'`]~\//, why: "writes into the user's home directory" },
  { re: /["'`]\/(usr|etc|opt|home|Users|var)\//, why: "writes to an absolute system path" },
];

/** `paperclip` as a path segment, but not this repo's own name. */
const CORE_PATH_REF = /paperclip(?!-plica)(?![-\w])/;

/**
 * The checker and its tests spell out every pattern they ban, so scanning them
 * would flag them. Path rules still apply to both.
 */
const CONTENT_SCAN_EXEMPT = new Set([
  "scripts/check-plugin-surface.mjs",
  "scripts/check-plugin-surface.test.mjs",
]);

/** @typedef {{file: string, rule: string, detail: string, line?: number}} Violation */

/** Is this path inside the plugin surface at all? */
export function isAllowedPath(file) {
  if (ALLOWED_ROOT_FILES.includes(file)) return true;
  return ALLOWED_DIRS.some((dir) => file.startsWith(dir));
}

/**
 * Path-level rules: the forbidden patterns first (they are the specific,
 * explainable failures), then the blanket allowlist.
 *
 * @param {string[]} files
 * @returns {Violation[]}
 */
export function checkPaths(files) {
  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    const forbidden = FORBIDDEN_PATHS.find((rule) => rule.re.test(file));
    if (forbidden) {
      violations.push({ file, rule: "forbidden-path", detail: forbidden.why });
      continue;
    }
    if (!isAllowedPath(file)) {
      violations.push({
        file,
        rule: "outside-plugin-surface",
        detail: "not under an allowed directory and not an allowed root file",
      });
    }
  }
  return violations;
}

/**
 * Content-level rules, run over the changed text files.
 *
 * These catch the changes that look innocent as a path — a `package.json` edit,
 * a line in a build script — but reach out of the plugin all the same.
 *
 * @param {string} file
 * @param {string} text
 * @returns {Violation[]}
 */
export function checkFileContent(file, text) {
  /** @type {Violation[]} */
  const violations = [];

  if (CONTENT_SCAN_EXEMPT.has(file)) return violations;

  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const lineNo = i + 1;

    for (const rule of PATCH_TOOLING) {
      if (rule.re.test(line)) {
        violations.push({ file, line: lineNo, rule: "patching-core", detail: rule.why });
      }
    }

    if (WRITE_CALL.test(line)) {
      const escape = ESCAPING_TARGET.find((rule) => rule.re.test(line));
      if (escape) {
        violations.push({
          file,
          line: lineNo,
          rule: "writes-outside-repo",
          detail: `filesystem write that ${escape.why}`,
        });
      } else if (CORE_PATH_REF.test(line)) {
        violations.push({
          file,
          line: lineNo,
          rule: "writes-outside-repo",
          detail: "filesystem write to a path naming a Paperclip checkout",
        });
      }
    }
  });

  if (file === "package.json") {
    violations.push(...checkPackageJson(text));
  }

  return violations;
}

/**
 * `link:`/`file:` dependencies are how a plugin would quietly start building
 * against — or worse, into — a core checkout. The two SDK links are the
 * sanctioned surface (README, "Install"); a third one is a new coupling that
 * needs a decision, not a merge.
 *
 * @param {string} text
 * @returns {Violation[]}
 */
function checkPackageJson(text) {
  /** @type {Violation[]} */
  const violations = [];
  /** @type {any} */
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return [{ file: "package.json", rule: "unparseable", detail: "package.json is not valid JSON" }];
  }

  const groups = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  for (const group of groups) {
    for (const [name, spec] of Object.entries(pkg[group] ?? {})) {
      if (typeof spec !== "string") continue;
      if (!/^(link|file):/.test(spec)) continue;
      if (ALLOWED_LOCAL_DEPS.has(name)) continue;
      violations.push({
        file: "package.json",
        rule: "local-dependency",
        detail: `${group}.${name} = "${spec}" — only ${[...ALLOWED_LOCAL_DEPS].join(" and ")} may be local links`,
      });
    }
  }

  if (pkg.pnpm?.patchedDependencies) {
    violations.push({
      file: "package.json",
      rule: "patching-core",
      detail: "pnpm.patchedDependencies rewrites installed dependency source",
    });
  }

  return violations;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function changedFiles(base) {
  // Three-dot: what this branch adds relative to where it diverged, so an
  // unrelated commit landing on main mid-review does not become our violation.
  const range = `${base}...HEAD`;
  const out = git(["diff", "--name-only", "--diff-filter=ACMR", range]);
  return out.split("\n").filter(Boolean);
}

function trackedFiles() {
  return git(["ls-files"]).split("\n").filter(Boolean);
}

function resolveBase(requested) {
  if (requested) return requested;
  for (const ref of ["origin/main", "main"]) {
    try {
      git(["rev-parse", "--verify", "--quiet", ref]);
      return ref;
    } catch {
      // try the next candidate
    }
  }
  throw new Error("no base ref found — pass --base <ref>");
}

function main(argv) {
  const all = argv.includes("--all");
  const baseIdx = argv.indexOf("--base");
  const base = baseIdx === -1 ? undefined : argv[baseIdx + 1];

  const files = all ? trackedFiles() : changedFiles(resolveBase(base));

  if (files.length === 0) {
    console.log("plugin surface: no changed files to check");
    return 0;
  }

  const violations = checkPaths(files);
  for (const file of files) {
    if (!TEXT_EXT.test(file)) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // deleted between diff and read
    }
    violations.push(...checkFileContent(file, text));
  }

  if (violations.length === 0) {
    console.log(`plugin surface: ${files.length} file(s) checked, no violations`);
    return 0;
  }

  console.error("\nPlugin surface violation — this change reaches outside the Plica plugin.\n");
  for (const v of violations) {
    const where = v.line ? `${v.file}:${v.line}` : v.file;
    console.error(`  ✖ ${where}\n      [${v.rule}] ${v.detail}`);
  }
  console.error(
    "\nPlica never modifies Paperclip core. See CONTRIBUTING.md, " +
      '"Never modify Paperclip core".\n' +
      "If the plugin surface genuinely cannot express this change, do not work\n" +
      "around it: open a core-limitation issue and let the user decide.\n",
  );
  return 1;
}

// Only run as a CLI, so the rules above stay importable from tests.
if (process.argv[1] && process.argv[1].endsWith("check-plugin-surface.mjs")) {
  process.exit(main(process.argv.slice(2)));
}
