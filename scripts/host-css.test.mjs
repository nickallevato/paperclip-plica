import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { chooseHostCss, linkedStylesheets, resolveHostCss } from "./host-css.mjs";

describe("linkedStylesheets", () => {
  it("reads the sheet Vite names in the host's index.html", () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" crossorigin href="/assets/index-tk1F4est.css">
    </head></html>`;
    expect(linkedStylesheets(html)).toEqual(["index-tk1F4est.css"]);
  });

  it("accepts a compound rel, which is still the host declaring a stylesheet", () => {
    expect(linkedStylesheets(`<link rel="preload stylesheet" href="/assets/a.css">`)).toEqual(["a.css"]);
  });

  it("ignores links that are not stylesheets", () => {
    const html = `<link rel="icon" href="/favicon.svg"><link rel="manifest" href="/site.webmanifest">`;
    expect(linkedStylesheets(html)).toEqual([]);
  });

  it("ignores a modulepreload of a .css-named chunk, which rel does not claim is a sheet", () => {
    expect(linkedStylesheets(`<link rel="modulepreload" href="/assets/not-a-sheet.css">`)).toEqual([]);
  });

  it("strips the query and fragment a cache-busted href carries", () => {
    expect(linkedStylesheets(`<link rel=stylesheet href=/assets/index-abc123.css?v=2>`)).toEqual([
      "index-abc123.css",
    ]);
  });
});

describe("chooseHostCss", () => {
  // The regression this whole module exists for: an abandoned sheet from an
  // earlier build, left behind in an unclean dist/, that is BIGGER than the live
  // one. Picking by size records the dead sheet, so the stamp never matches what
  // the page serves and no number of rebuilds clears the badge.
  const stale = { name: "index-OLD00000.css", size: 900_000, mtimeMs: 1_000 };
  const live = { name: "index-NEW11111.css", size: 500_000, mtimeMs: 2_000 };

  it("takes the sheet index.html links, even when a bigger one sits beside it", () => {
    const choice = chooseHostCss({ linked: [live.name], files: [stale, live] });
    expect(choice.name).toBe(live.name);
    expect(choice.basis).toBe("index.html");
    expect(choice.passedOver).toEqual([stale.name]);
  });

  it("falls back to the newest, not the largest, when there is no index.html", () => {
    const choice = chooseHostCss({ linked: [], files: [stale, live] });
    expect(choice.name).toBe(live.name);
    expect(choice.basis).toBe("newest");
    expect(choice.warnings.join(" ")).toContain("PLICA_HOST_CSS");
  });

  it("does not warn about ambiguity when there is only one sheet to choose", () => {
    const choice = chooseHostCss({ linked: [], files: [live] });
    expect(choice).toMatchObject({ name: live.name, basis: "only", passedOver: [], warnings: [] });
  });

  it("ignores a sheet index.html names but the assets dir does not have", () => {
    // A dist rebuilt while index.html was cached, or a partially-synced deploy:
    // the named sheet cannot be subtracted because its bytes are not there.
    const choice = chooseHostCss({ linked: ["index-GONE0000.css"], files: [live] });
    expect(choice.name).toBe(live.name);
    expect(choice.warnings.join(" ")).toContain("index-GONE0000.css");
  });

  it("takes the largest when index.html genuinely links several live sheets", () => {
    const vendor = { name: "vendor-aaaaaa.css", size: 10_000, mtimeMs: 3_000 };
    const choice = chooseHostCss({ linked: [vendor.name, live.name], files: [vendor, live] });
    expect(choice.name).toBe(live.name);
    expect(choice.warnings.join(" ")).toContain("largest");
  });

  it("answers null rather than guessing when the assets dir holds no stylesheet", () => {
    expect(chooseHostCss({ linked: [], files: [] })).toMatchObject({ name: null, basis: "none" });
  });
});

describe("resolveHostCss", () => {
  const roots = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  /** A host dist/ with the given assets and, optionally, an index.html. */
  function dist({ assets = {}, indexLinks = null }) {
    const root = mkdtempSync(join(tmpdir(), "plica-host-css-"));
    roots.push(root);
    mkdirSync(join(root, "assets"), { recursive: true });
    for (const [name, { bytes, mtime }] of Object.entries(assets)) {
      const file = join(root, "assets", name);
      writeFileSync(file, "a".repeat(bytes));
      if (mtime) utimesSync(file, mtime, mtime);
    }
    if (indexLinks) {
      const links = indexLinks.map((f) => `<link rel="stylesheet" href="/assets/${f}">`).join("");
      writeFileSync(join(root, "index.html"), `<!doctype html><html><head>${links}</head></html>`);
    }
    return root;
  }

  it("resolves through index.html past a larger leftover", () => {
    const root = dist({
      assets: { "index-OLD.css": { bytes: 900, mtime: 1000 }, "index-NEW.css": { bytes: 100, mtime: 2000 } },
      indexLinks: ["index-NEW.css"],
    });
    const got = resolveHostCss({ env: {}, dist: root });
    expect(got.path).toBe(join(root, "assets", "index-NEW.css"));
    expect(got.basis).toBe("index.html");
  });

  it("honours PLICA_HOST_CSS but says out loud that it skipped the scan", () => {
    const root = dist({ assets: { "index-NEW.css": { bytes: 100 } }, indexLinks: ["index-NEW.css"] });
    const got = resolveHostCss({ env: { PLICA_HOST_CSS: "/elsewhere/index-OTHER.css" }, dist: root });
    expect(got.path).toBe("/elsewhere/index-OTHER.css");
    expect(got.warnings.join(" ")).toContain("PLICA_HOST_CSS is set");
  });

  it("calls out an override that disagrees with the dist it is overriding", () => {
    // The top cause of a badge that survives a good build: a stale export in a
    // shell profile. Silently winning is what made it hard to find.
    const root = dist({ assets: { "index-NEW.css": { bytes: 100 } }, indexLinks: ["index-NEW.css"] });
    const got = resolveHostCss({ env: { PLICA_HOST_CSS: "/old/index-OLD.css" }, dist: root });
    expect(got.warnings.join(" ")).toContain("index-NEW.css");
    expect(got.warnings.join(" ")).toContain("stale");
  });

  it("stays quiet when the override agrees with index.html", () => {
    const root = dist({ assets: { "index-NEW.css": { bytes: 100 } }, indexLinks: ["index-NEW.css"] });
    const got = resolveHostCss({ env: { PLICA_HOST_CSS: join(root, "assets", "index-NEW.css") }, dist: root });
    expect(got.warnings.join(" ")).not.toContain("stale");
  });

  it("reports a missing assets dir instead of throwing", () => {
    const got = resolveHostCss({ env: {}, dist: join(tmpdir(), "plica-host-css-absent") });
    expect(got.path).toBeNull();
    expect(got.warnings.join(" ")).toContain("does not exist");
  });
});
