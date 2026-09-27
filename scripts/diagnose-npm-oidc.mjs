#!/usr/bin/env node
/**
 * Asks npm, in its own words, why trusted publishing was refused.
 *
 * `npm publish` on a runner with no token does two requests before it uploads
 * anything: it asks GitHub for an OIDC token, then trades that token with the
 * registry for a short-lived publish credential. When the trade is refused, npm
 * swallows the registry's answer and reports `ENEEDAUTH` — "you need to
 * authorize this machine" — which describes neither the cause nor the fix and
 * reads identically whether the package has no trusted publisher at all or one
 * whose repository, workflow filename or environment does not match the run.
 *
 * That ambiguity cost several release attempts on PLI-235: the only way to tell
 * the two apart was to change something on npmjs.com and push a tag again.
 * There is no read API for trusted-publisher configuration, but the exchange
 * endpoint answers with a reason, so this script performs the same two requests
 * npm does and prints what comes back. It publishes nothing and needs no token.
 *
 * Deliberately read-only and safe to run on any refusal:
 *   node scripts/diagnose-npm-oidc.mjs
 *
 * Nothing it prints is a credential. The OIDC token and any publish token the
 * registry hands back are used and discarded, never logged — a CI log is
 * readable by everyone with access to the repository.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The tree this script belongs to, so the package name it reports is the one
 * that would be published rather than whatever directory the caller is in.
 *
 * Under a test runner `import.meta.url` is not a `file:` URL, and there the
 * working directory is the repository root, which is the honest fallback.
 */
function repoRoot() {
  try {
    return dirname(dirname(fileURLToPath(import.meta.url)));
  } catch {
    return process.cwd();
  }
}

/** The audience npm asks GitHub to mint the OIDC token for. Must match what npm uses. */
export const AUDIENCE = "npm:registry.npmjs.org";

/** The registry Plica publishes to, kept in step with publish-npm.mjs. */
export const REGISTRY = "https://registry.npmjs.org";

/**
 * Where a token is traded for a publish credential, for one package.
 *
 * @param {string} registry
 * @param {string} packageName
 * @returns {string}
 */
export function exchangeUrl(registry, packageName) {
  return `${registry.replace(/\/+$/, "")}/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(packageName)}`;
}

/**
 * Runs the two requests `npm publish` makes, and reports where they stopped.
 *
 * Split from the reporting below so the whole sequence can be tested against a
 * fake `fetch` — there is no other way to exercise "npm said the repository
 * does not match" without a misconfigured package to point at.
 *
 * @param {object} opts
 * @param {Record<string, string | undefined>} opts.env
 * @param {string} opts.packageName
 * @param {typeof fetch} opts.fetchImpl
 * @param {string} [opts.registry]
 * @returns {Promise<{stage: "env" | "id-token" | "exchange", ok: boolean, status?: number, message?: string}>}
 */
export async function diagnose({ env, packageName, fetchImpl, registry = REGISTRY }) {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !requestToken) {
    return { stage: "env", ok: false };
  }

  const idTokenResponse = await fetchImpl(`${url}&audience=${encodeURIComponent(AUDIENCE)}`, {
    headers: { authorization: `Bearer ${requestToken}` },
  });
  if (!idTokenResponse.ok) {
    return {
      stage: "id-token",
      ok: false,
      status: idTokenResponse.status,
      message: await readMessage(idTokenResponse),
    };
  }
  // `value` is the JWT. It is passed straight to the registry and never printed.
  const { value } = await idTokenResponse.json();
  if (!value) {
    return { stage: "id-token", ok: false, status: idTokenResponse.status, message: "no token in the response" };
  }

  const exchange = await fetchImpl(exchangeUrl(registry, packageName), {
    method: "POST",
    headers: { authorization: `Bearer ${value}`, "content-type": "application/json" },
  });
  return {
    stage: "exchange",
    ok: exchange.ok,
    status: exchange.status,
    message: await readMessage(exchange),
  };
}

/**
 * The registry answers with JSON, GitHub sometimes with text; either may be the
 * only clue, so take whichever is there rather than assuming a shape.
 *
 * @param {{ text: () => Promise<string> }} response
 * @returns {Promise<string>}
 */
async function readMessage(response) {
  let body = "";
  try {
    body = await response.text();
  } catch {
    return "";
  }
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.message ?? parsed?.error ?? "";
    if (typeof message === "string" && message) return message;
  } catch {
    // Not JSON. The raw body is still better than nothing.
  }
  return body.slice(0, 400).trim();
}

/**
 * Turns a result into what to go and do about it.
 *
 * Each line names one place to look, because the whole point of this script is
 * to replace "it is probably npm's side" with an instruction.
 *
 * @param {{stage: string, ok: boolean, status?: number, message?: string}} result
 * @param {string} packageName
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function explain(result, packageName) {
  if (result.stage === "env") {
    return {
      ok: false,
      lines: [
        "Not running with a GitHub Actions OIDC token, so there is nothing to diagnose here.",
        "On a runner this means the job is missing `id-token: write`; locally it means trusted",
        "publishing cannot be tested at all — only the release workflow can.",
      ],
    };
  }

  if (result.stage === "id-token") {
    return {
      ok: false,
      lines: [
        `GitHub would not issue an OIDC token (HTTP ${result.status}): ${result.message}`,
        "This is the repository's side: check `permissions: id-token: write` on the job.",
      ],
    };
  }

  if (result.ok) {
    return {
      ok: true,
      lines: [
        "npm accepted the OIDC token and issued a publish credential.",
        `Trusted publishing is configured for ${packageName} and matches this workflow, so a`,
        "publish refused here failed for some other reason — read npm's error again.",
      ],
    };
  }

  return {
    ok: false,
    lines: [
      `npm refused the OIDC token (HTTP ${result.status}): ${result.message}`,
      "npm's message above is the authoritative reason; this is what `ENEEDAUTH` was hiding.",
      `Compare the entry at npmjs.com → ${packageName} → Settings → Trusted publishers against`,
      "this run: organization or user `nickallevato`, repository `paperclip-plica`, workflow",
      "filename `release.yml` (the bare name, not a path), environment blank, and the allowed",
      "actions including `npm publish`. All of those are matched exactly and case-sensitively.",
    ],
  };
}

/**
 * @param {object} [opts]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {(line: string) => void} [opts.log]
 * @returns {Promise<number>} Process exit code: 0 when npm accepted the token.
 */
export async function main({ env = process.env, fetchImpl = fetch, log = console.error } = {}) {
  const packageName = JSON.parse(readFileSync(join(repoRoot(), "package.json"), "utf8")).name;

  log("");
  log(`Asking npm why trusted publishing for ${packageName} was refused (publishing nothing):`);
  let result;
  try {
    result = await diagnose({ env, packageName, fetchImpl });
  } catch (error) {
    log(`  the diagnostic itself failed: ${error?.message ?? error}`);
    return 1;
  }
  const { ok, lines } = explain(result, packageName);
  for (const line of lines) log(`  ${line}`);
  log("");
  return ok ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith("diagnose-npm-oidc.mjs")) {
  process.exit(await main());
}
