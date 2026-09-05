import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { isValidBranchName } from "./check-branch-name.mjs";

describe("isValidBranchName", () => {
  it("accepts an issue-keyed branch", () => {
    expect(isValidBranchName("pli-4/pr-workflow-and-review-gate")).toBe(true);
    expect(isValidBranchName("pli-12/board-hud")).toBe(true);
  });

  it("accepts a conventional-commit type when there is no issue", () => {
    for (const type of ["feat", "fix", "docs", "chore", "refactor", "perf", "test", "ci", "build", "revert"]) {
      expect(isValidBranchName(`${type}/some-change`), type).toBe(true);
    }
  });

  it("leaves main and bot branches alone", () => {
    expect(isValidBranchName("main")).toBe(true);
    expect(isValidBranchName("dependabot/npm_and_yarn/vitest-4.1.11")).toBe(true);
  });

  it("rejects a bare name with no prefix", () => {
    expect(isValidBranchName("fix-the-thing")).toBe(false);
  });

  it("rejects an unknown prefix", () => {
    expect(isValidBranchName("wip/whatever")).toBe(false);
    expect(isValidBranchName("nick/whatever")).toBe(false);
  });

  it("rejects a slug that is not lowercase kebab-case", () => {
    expect(isValidBranchName("fix/Board_Row")).toBe(false);
    expect(isValidBranchName("fix/board row")).toBe(false);
    expect(isValidBranchName("fix/board--row")).toBe(false);
    expect(isValidBranchName("fix/-leading")).toBe(false);
    expect(isValidBranchName("fix/trailing-")).toBe(false);
  });

  it("rejects a nested slug, which would collide with the prefix segment", () => {
    expect(isValidBranchName("fix/board/row")).toBe(false);
  });

  it("rejects an empty slug", () => {
    expect(isValidBranchName("fix/")).toBe(false);
    expect(isValidBranchName("fix")).toBe(false);
  });
});

describe("the CLI", () => {
  const run = (args) => {
    try {
      const stdout = execFileSync("node", ["scripts/check-branch-name.mjs", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, stdout };
    } catch (err) {
      return { code: err.status, stderr: err.stderr };
    }
  };

  it("exits 0 on a valid name", () => {
    expect(run(["pli-4/pr-workflow-and-review-gate"]).code).toBe(0);
  });

  it("exits 1 and explains how to rename on an invalid one", () => {
    const { code, stderr } = run(["wip/whatever"]);
    expect(code).toBe(1);
    expect(stderr).toContain("git branch -m");
  });
});
