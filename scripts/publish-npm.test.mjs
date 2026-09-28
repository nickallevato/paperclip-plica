import { describe, expect, it } from "vitest";

import {
  TOKEN_ENV_NAMES,
  checkCheckout,
  failureHint,
  publishArgs,
  resolveAuth,
  resolveEnvToken,
} from "./publish-npm.mjs";

describe("resolveEnvToken", () => {
  it("finds nothing on an environment with no token", () => {
    expect(resolveEnvToken({})).toEqual({ token: "", source: "" });
  });

  it("reads the repository secret the release workflow passes", () => {
    expect(resolveEnvToken({ NPM_TOKEN: "npm_a" })).toEqual({
      token: "npm_a",
      source: "NPM_TOKEN",
    });
  });

  it("reads what setup-node calls the same thing", () => {
    expect(resolveEnvToken({ NODE_AUTH_TOKEN: "npm_b" }).source).toBe("NODE_AUTH_TOKEN");
  });

  it("reads the name Paperclip binds the secret to for an agent", () => {
    // An agent gets the credential under the name it was stored as; the script
    // knows the name so no agent has to copy a token between variables.
    expect(resolveEnvToken({ NPM_TOKEN_90_DAY_EXP: "npm_c" })).toEqual({
      token: "npm_c",
      source: "NPM_TOKEN_90_DAY_EXP",
    });
  });

  it("prefers the earlier name when a runner has several set", () => {
    const env = { NPM_TOKEN_90_DAY_EXP: "npm_c", NODE_AUTH_TOKEN: "npm_b", NPM_TOKEN: "npm_a" };
    expect(resolveEnvToken(env).source).toBe("NPM_TOKEN");
  });

  it("ignores a variable that is set but blank", () => {
    // Actions expands an unset secret to the empty string, so `NPM_TOKEN: ""`
    // is the normal shape of "no secret configured", not a token.
    expect(resolveEnvToken({ NPM_TOKEN: "  ", NPM_TOKEN_90_DAY_EXP: "npm_c" })).toEqual({
      token: "npm_c",
      source: "NPM_TOKEN_90_DAY_EXP",
    });
  });

  it("trims a token pasted with trailing whitespace", () => {
    expect(resolveEnvToken({ NPM_TOKEN: "npm_a\n" }).token).toBe("npm_a");
  });
});

describe("resolveAuth", () => {
  it("prefers an explicit token when one is on the environment", () => {
    expect(resolveAuth({ token: "npm_xxx", oidcAvailable: true, ci: true }).kind).toBe("token");
  });

  it("names the variable the token came from, so a release is traceable", () => {
    const { detail } = resolveAuth({ token: "npm_xxx", tokenSource: "NPM_TOKEN_90_DAY_EXP" });
    expect(detail).toContain("NPM_TOKEN_90_DAY_EXP");
  });

  it("uses trusted publishing when there is no token but OIDC is available", () => {
    expect(resolveAuth({ oidcAvailable: true, ci: true }).kind).toBe("oidc");
  });

  it("falls back to ~/.npmrc for a person at a terminal", () => {
    expect(resolveAuth({ ci: false }).kind).toBe("local");
  });

  it("refuses rather than letting an unattended run fail as a 404", () => {
    // An unauthenticated publish reports the package as missing, which reads
    // like a different problem entirely. Say what is actually absent.
    const { kind, detail } = resolveAuth({ ci: true });
    expect(kind).toBe("none");
    for (const name of TOKEN_ENV_NAMES) expect(detail).toContain(name);
    expect(detail).toContain("id-token: write");
  });
});

describe("publishArgs", () => {
  it("publishes plainly by default", () => {
    expect(publishArgs()).toEqual(["publish"]);
  });

  it("asks for provenance only where a build can be attested", () => {
    expect(publishArgs({ provenance: true })).toEqual(["publish", "--provenance"]);
  });

  it("packs without publishing on a dry run", () => {
    expect(publishArgs({ dryRun: true, provenance: true })).toEqual([
      "publish",
      "--provenance",
      "--dry-run",
    ]);
  });
});

describe("checkCheckout", () => {
  const head = "1111111111111111111111111111111111111111";
  const clean = { dirty: false, tag: "v0.6.0", head, tagCommit: head };

  it("allows a clean checkout sitting on the tag", () => {
    expect(checkCheckout(clean)).toMatchObject({ ok: true, problems: [] });
  });

  it("allows a clean checkout with no tag named, for a dry run", () => {
    expect(checkCheckout({ dirty: false, head }).ok).toBe(true);
  });

  it("refuses uncommitted changes, which the tarball would ship unrecorded", () => {
    const { ok, problems } = checkCheckout({ ...clean, dirty: true });
    expect(ok).toBe(false);
    expect(problems[0]).toContain("uncommitted");
  });

  it("refuses a tag that does not exist here", () => {
    const { ok, problems } = checkCheckout({ ...clean, tagCommit: "" });
    expect(ok).toBe(false);
    expect(problems[0]).toContain("does not exist");
  });

  it("refuses HEAD pointing somewhere other than the tag", () => {
    const { ok, problems } = checkCheckout({ ...clean, tagCommit: "2222222222222222222222222222222222222222" });
    expect(ok).toBe(false);
    expect(problems[0]).toContain("publish from a checkout of the tag");
  });
});

describe("failureHint", () => {
  it("tells a token run that the token may not be allowed to publish", () => {
    const hint = failureHint("token");
    expect(hint).toContain("403");
    expect(hint).toContain("Automation");
  });

  it("tells an OIDC run to check the trusted publisher, not the machine", () => {
    expect(failureHint("oidc")).toContain("Trusted publishers");
  });

  it("does not assert the entry is missing, which npm's refusal never says", () => {
    const hint = failureHint("oidc");
    expect(hint).toContain("does not say whether");
    expect(hint).toMatch(/renam/i);
  });

  it("says nothing extra for a local ~/.npmrc, where npm's own error is the truth", () => {
    expect(failureHint("local")).toBe("");
  });
});
