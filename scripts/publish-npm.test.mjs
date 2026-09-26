import { describe, expect, it } from "vitest";

import { checkCheckout, publishArgs, resolveAuth } from "./publish-npm.mjs";

describe("resolveAuth", () => {
  it("prefers an explicit token when one is on the environment", () => {
    expect(resolveAuth({ token: "npm_xxx", oidcAvailable: true, ci: true }).kind).toBe("token");
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
    expect(detail).toContain("NPM_TOKEN");
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
