import { describe, expect, it, vi } from "vitest";

import { AUDIENCE, diagnose, exchangeUrl, explain, main } from "./diagnose-npm-oidc.mjs";

/** A fetch that answers a scripted sequence, and records what it was asked. */
function fakeFetch(responses) {
  const calls = [];
  const impl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => JSON.parse(next.body),
      text: async () => next.body,
    };
  });
  return { impl, calls };
}

const actionsEnv = {
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.example/token?api-version=1",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
};

const idTokenOk = { status: 200, body: JSON.stringify({ value: "header.payload.signature" }) };

describe("exchangeUrl", () => {
  it("addresses the package npm trades a token for", () => {
    expect(exchangeUrl("https://registry.npmjs.org", "paperclip-plugin-plica")).toBe(
      "https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/paperclip-plugin-plica",
    );
  });

  it("escapes a scoped name, which would otherwise read as a second path segment", () => {
    expect(exchangeUrl("https://registry.npmjs.org", "@scope/pkg")).toContain("%40scope%2Fpkg");
  });

  it("tolerates a registry written with a trailing slash", () => {
    expect(exchangeUrl("https://registry.npmjs.org/", "pkg")).toContain(".org/-/npm/");
  });
});

describe("diagnose", () => {
  it("says there is nothing to diagnose off a runner", async () => {
    const { impl } = fakeFetch([]);
    expect(await diagnose({ env: {}, packageName: "pkg", fetchImpl: impl })).toEqual({
      stage: "env",
      ok: false,
    });
    expect(impl).not.toHaveBeenCalled();
  });

  it("asks GitHub for the same audience npm does", async () => {
    const { impl, calls } = fakeFetch([idTokenOk, { status: 200, body: JSON.stringify({ token: "npm_x" }) }]);
    await diagnose({ env: actionsEnv, packageName: "pkg", fetchImpl: impl });
    expect(calls[0].url).toBe(
      `${actionsEnv.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${encodeURIComponent(AUDIENCE)}`,
    );
    expect(calls[0].init.headers.authorization).toBe("Bearer request-token");
  });

  it("presents the OIDC token to the registry, and reports that it was accepted", async () => {
    const { impl, calls } = fakeFetch([idTokenOk, { status: 200, body: JSON.stringify({ token: "npm_x" }) }]);
    const result = await diagnose({ env: actionsEnv, packageName: "pkg", fetchImpl: impl });
    expect(calls[1].init.method).toBe("POST");
    expect(calls[1].init.headers.authorization).toBe("Bearer header.payload.signature");
    expect(result).toMatchObject({ stage: "exchange", ok: true, status: 200 });
  });

  it("stops at GitHub when the job cannot mint a token", async () => {
    const { impl } = fakeFetch([{ status: 403, body: "id-token not permitted" }]);
    const result = await diagnose({ env: actionsEnv, packageName: "pkg", fetchImpl: impl });
    expect(result).toEqual({ stage: "id-token", ok: false, status: 403, message: "id-token not permitted" });
  });

  it("treats a 200 with no token in it as a failure to mint one", async () => {
    const { impl } = fakeFetch([{ status: 200, body: JSON.stringify({}) }]);
    const result = await diagnose({ env: actionsEnv, packageName: "pkg", fetchImpl: impl });
    expect(result).toMatchObject({ stage: "id-token", ok: false });
  });

  it("carries the registry's reason back, which is what ENEEDAUTH hides", async () => {
    const { impl } = fakeFetch([
      idTokenOk,
      { status: 404, body: JSON.stringify({ message: "package is not configured for trusted publishing" }) },
    ]);
    const result = await diagnose({ env: actionsEnv, packageName: "pkg", fetchImpl: impl });
    expect(result).toEqual({
      stage: "exchange",
      ok: false,
      status: 404,
      message: "package is not configured for trusted publishing",
    });
  });

  it("falls back to the raw body when the registry does not answer in JSON", async () => {
    const { impl } = fakeFetch([idTokenOk, { status: 502, body: "<html>bad gateway</html>" }]);
    const result = await diagnose({ env: actionsEnv, packageName: "pkg", fetchImpl: impl });
    expect(result.message).toBe("<html>bad gateway</html>");
  });
});

describe("explain", () => {
  it("names the job permission when GitHub refused", () => {
    const { ok, lines } = explain({ stage: "id-token", ok: false, status: 403, message: "nope" }, "pkg");
    expect(ok).toBe(false);
    expect(lines.join(" ")).toContain("id-token: write");
  });

  it("clears trusted publishing when npm accepted the token", () => {
    const { ok, lines } = explain({ stage: "exchange", ok: true, status: 200 }, "pkg");
    expect(ok).toBe(true);
    expect(lines.join(" ")).toContain("some other reason");
  });

  it("quotes npm's refusal and points at the fields that must match", () => {
    const refusal = { stage: "exchange", ok: false, status: 404, message: "not configured" };
    const { ok, lines } = explain(refusal, "paperclip-plugin-plica");
    expect(ok).toBe(false);
    const text = lines.join(" ");
    expect(text).toContain("not configured");
    expect(text).toContain("404");
    expect(text).toContain("release.yml");
    expect(text).toContain("paperclip-plugin-plica");
  });

  it("explains that trusted publishing cannot be tested off a runner", () => {
    const { lines } = explain({ stage: "env", ok: false }, "pkg");
    expect(lines.join(" ")).toContain("only the release workflow");
  });
});

describe("main", () => {
  it("reports the real package name and exits 0 when npm accepts the token", async () => {
    const { impl } = fakeFetch([idTokenOk, { status: 200, body: JSON.stringify({ token: "npm_x" }) }]);
    const lines = [];
    const code = await main({ env: actionsEnv, fetchImpl: impl, log: (line) => lines.push(line) });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("paperclip-plugin-plica");
  });

  it("exits non-zero on a refusal, having printed npm's message", async () => {
    const { impl } = fakeFetch([idTokenOk, { status: 422, body: JSON.stringify({ message: "workflow mismatch" }) }]);
    const lines = [];
    const code = await main({ env: actionsEnv, fetchImpl: impl, log: (line) => lines.push(line) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("workflow mismatch");
  });

  it("never lets a broken diagnostic throw into the caller", async () => {
    const impl = vi.fn(async () => {
      throw new Error("network down");
    });
    const lines = [];
    const code = await main({ env: actionsEnv, fetchImpl: impl, log: (line) => lines.push(line) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("network down");
  });

  it("prints no credential, so a CI log stays safe to read", async () => {
    const { impl } = fakeFetch([idTokenOk, { status: 200, body: JSON.stringify({ token: "npm_secret_value" }) }]);
    const lines = [];
    await main({ env: actionsEnv, fetchImpl: impl, log: (line) => lines.push(line) });
    const text = lines.join("\n");
    expect(text).not.toContain("npm_secret_value");
    expect(text).not.toContain("header.payload.signature");
    expect(text).not.toContain("request-token");
  });
});
