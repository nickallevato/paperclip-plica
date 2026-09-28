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
 * The registry's own answer is narrower than it looks: measured on 2026-09-28,
 * a package with no trusted publisher and a package whose entry names the wrong
 * repository both come back `HTTP 404 ... package not found`. So this script
 * does not claim to know which one it is. What it can do is print the claims
 * this run actually presents, which is the other half of the comparison and the
 * half nobody can read off npmjs.com.
 *
 * Deliberately read-only and safe to run on any refusal:
 *   node scripts/diagnose-npm-oidc.mjs
 *
 * Nothing it prints is a credential. The OIDC token and any publish token the
 * registry hands back are used and discarded, never logged — a CI log is
 * readable by everyone with access to the repository. The claims printed on a
 * refusal are decoded from the token's payload, which is not secret, and are
 * copied out field by field so the token itself can never travel with them.
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

/** The registry Tickler publishes to, kept in step with publish-npm.mjs. */
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
 * The claims npm matches an OIDC token against a trusted-publisher entry with.
 *
 * Reported in this order because that is the order they appear on the npmjs.com
 * form, so the two can be read side by side.
 */
export const REPORTED_CLAIMS = ["repository", "repository_owner", "workflow_ref", "environment"];

/**
 * Pulls the matched claims out of an OIDC token, and nothing else.
 *
 * A JWT payload is base64url JSON and carries no secret — the signature is what
 * makes it a credential, and that is never touched here. Only the four named
 * claims are copied out, so no future claim can be printed by accident and the
 * token cannot leak through this function whatever it is handed.
 *
 * @param {unknown} token
 * @returns {Record<string, string> | null} Claims, or null if it will not decode.
 */
export function decodeClaims(token) {
  const payloadSegment = String(token ?? "").split(".")[1];
  if (!payloadSegment) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const claims = {};
  for (const name of REPORTED_CLAIMS) {
    const value = payload[name];
    claims[name] = typeof value === "string" ? value : "";
  }
  return claims;
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
 * @returns {Promise<{stage: "env" | "id-token" | "exchange", ok: boolean, status?: number, message?: string, claims?: Record<string, string> | null}>}
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
    claims: decodeClaims(value),
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
 * @param {{stage: string, ok: boolean, status?: number, message?: string, claims?: Record<string, string> | null}} result
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
      "That is the registry's own answer, which npm replaced with `ENEEDAUTH`. It is the",
      "reason, but it is not a diagnosis:",
      ...(result.status === 404
        ? [
            "a 404 does not say which of two things went wrong. The package may have no trusted",
            "publisher entry at all, or it may have one that does not match this run — npm answers",
            "the same either way, so do not read `package not found` as either one.",
            "The case that looks like neither: renaming the repository or the account leaves every",
            "entry naming the old path, and they stop matching silently — an entry that published",
            "before now 404s, because npm matches on the name, not the repository id.",
          ]
        : ["read it as npm's wording, not as a statement about which field is wrong."]),
      ...claimLines(result.claims),
      `Compare those, field by field, against the entry at npmjs.com → ${packageName} →`,
      "Settings → Trusted publishers. The entry's workflow field is the bare filename from the",
      "end of `workflow_ref`, before the `@`; a blank `environment` claim means the entry's",
      "environment must be blank too. Every field is matched exactly and case-sensitively.",
    ],
  };
}

/**
 * The run's own claims, laid out to be read against the npmjs.com form.
 *
 * Printed verbatim and never summarised: the previous version of this message
 * listed what the fields were *supposed* to be, which is exactly how a stale
 * repository name went unnoticed for three release attempts on PLI-239.
 *
 * @param {Record<string, string> | null | undefined} claims
 * @returns {string[]}
 */
function claimLines(claims) {
  if (!claims) {
    return [
      "This run's OIDC token would not decode, so its claims cannot be shown — compare the",
      "entry against the repository and workflow this job is actually running from.",
    ];
  }
  const width = Math.max(...REPORTED_CLAIMS.map((name) => name.length));
  return [
    "This run presents these claims — the values npm matched against, and did not accept:",
    ...REPORTED_CLAIMS.map(
      (name) => `  ${`${name}:`.padEnd(width + 1)} ${claims[name] || "(empty)"}`,
    ),
    "`workflow_ref` names the workflow that ran this probe, which is the publishing workflow",
    "only when this ran inside it.",
  ];
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
