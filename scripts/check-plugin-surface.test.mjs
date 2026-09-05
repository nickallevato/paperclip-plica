import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkFileContent, checkPaths, isAllowedPath } from "./check-plugin-surface.mjs";

const rules = (violations) => violations.map((v) => v.rule);

describe("checkPaths", () => {
  it("accepts the paths a plugin change actually touches", () => {
    expect(
      checkPaths([
        "src/ui/PlicaHud.tsx",
        "src/ui/host/api.ts",
        "scripts/build-css.mjs",
        "docs/screenshots/plica-hud.png",
        ".github/workflows/plugin-surface.yml",
        ".githooks/pre-commit",
        "CONTRIBUTING.md",
        "package.json",
      ]),
    ).toEqual([]);
  });

  it("rejects a new top-level directory", () => {
    expect(rules(checkPaths(["core/src/index.ts"]))).toEqual(["outside-plugin-surface"]);
  });

  it("rejects a root file that is not repo configuration", () => {
    expect(rules(checkPaths(["hotfix.ts"]))).toEqual(["outside-plugin-surface"]);
  });

  it("rejects a committed Paperclip checkout", () => {
    expect(rules(checkPaths(["paperclip/ui/src/plugins/slots.tsx"]))).toEqual(["forbidden-path"]);
    expect(rules(checkPaths(["packages/plugins/sdk/index.ts"]))).toEqual(["forbidden-path"]);
    expect(rules(checkPaths(["vendor/paperclip/shared.ts"]))).toEqual(["forbidden-path"]);
  });

  it("rejects patch artifacts wherever they sit", () => {
    expect(rules(checkPaths(["patches/@paperclipai__shared.patch"]))).toEqual(["forbidden-path"]);
    expect(rules(checkPaths(["src/fix-host.diff"]))).toEqual(["forbidden-path"]);
  });

  it("keeps src/ui/host/ legal — vendored copies are read-only, not core edits", () => {
    expect(isAllowedPath("src/ui/host/ui-kit/dialog.tsx")).toBe(true);
  });
});

describe("checkFileContent", () => {
  it("passes a build script that only reads the host bundle", () => {
    const text = [
      'const dir = join(homedir(), "paperclip", "ui", "dist", "assets");',
      "const css = readFileSync(hostSheet, \"utf8\");",
      'mkdirSync("dist/ui", { recursive: true });',
      'copyFileSync("src/ui/demo/demo-data.json", "dist/ui/demo-data.json");',
    ].join("\n");
    expect(checkFileContent("scripts/build-css.mjs", text)).toEqual([]);
  });

  it("flags a write into a Paperclip checkout", () => {
    const text = 'writeFileSync(join(homedir(), "paperclip", "ui", "src", "patch.ts"), src);';
    expect(rules(checkFileContent("scripts/build-css.mjs", text))).toEqual(["writes-outside-repo"]);
  });

  it("flags a write that climbs above the repo root", () => {
    const text = 'cpSync("dist/ui", "../paperclip/ui/public/plica", { recursive: true });';
    expect(rules(checkFileContent("esbuild.config.mjs", text))).toEqual(["writes-outside-repo"]);
  });

  it("flags patch tooling in any tracked file", () => {
    expect(rules(checkFileContent("package.json", '{"scripts":{"postinstall":"patch-package"}}')))
      .toContain("patching-core");
    expect(rules(checkFileContent(".github/workflows/ci.yml", "      run: pnpm patch @paperclipai/shared")))
      .toEqual(["patching-core"]);
  });

  it("flags pnpm.patchedDependencies", () => {
    const pkg = JSON.stringify({ pnpm: { patchedDependencies: { "@paperclipai/shared": "patches/x.patch" } } });
    expect(rules(checkFileContent("package.json", pkg))).toContain("patching-core");
  });

  it("allows the two sanctioned SDK links and nothing else", () => {
    const ok = JSON.stringify({
      devDependencies: {
        "@paperclipai/plugin-sdk": "link:../../paperclip/packages/plugins/sdk",
        "@paperclipai/shared": "link:../../paperclip/packages/shared",
      },
    });
    expect(checkFileContent("package.json", ok)).toEqual([]);

    const bad = JSON.stringify({
      dependencies: { "@paperclipai/server": "link:../../paperclip/packages/server" },
    });
    expect(rules(checkFileContent("package.json", bad))).toEqual(["local-dependency"]);
  });

  it("does not flag the repository's own name", () => {
    const text = 'cpSync("dist", "/tmp/paperclip-plica-out");';
    expect(checkFileContent("scripts/x.mjs", text)).toEqual([]);
  });
});

describe("the wiring", () => {
  // A checker nothing runs is worse than no checker: it reads as enforcement.
  it("is invoked by CI and by the pre-commit hook", () => {
    expect(readFileSync(".github/workflows/plugin-surface.yml", "utf8")).toContain(
      "node scripts/check-plugin-surface.mjs",
    );
    expect(readFileSync(".githooks/pre-commit", "utf8")).toContain("check-plugin-surface.mjs");
  });

  it("keeps every real tracked file inside the surface", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(checkPaths(tracked)).toEqual([]);
  });
});
