import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { classifyCheckout, isMainWorktree } from "./check-worktree.mjs";

describe("classifyCheckout", () => {
  const shared = { isPaperclipRun: true, isSharedCheckout: true, branch: "pli-15/shared-checkout-isolation" };

  it("blocks a topic branch in the shared checkout during an agent run", () => {
    const { ok, reason } = classifyCheckout(shared);
    expect(ok).toBe(false);
    expect(reason).toContain("pli-15/shared-checkout-isolation");
  });

  it("allows a linked worktree, which has its own HEAD and index", () => {
    expect(classifyCheckout({ ...shared, isSharedCheckout: false }).ok).toBe(true);
  });

  it("leaves human clones alone, since they share the checkout with nobody", () => {
    expect(classifyCheckout({ ...shared, isPaperclipRun: false }).ok).toBe(true);
  });

  it("exempts main, which is not one agent's in-flight work", () => {
    expect(classifyCheckout({ ...shared, branch: "main" }).ok).toBe(true);
  });

  it("stands down when the runtime says the workspace is not the shared one", () => {
    // An isolated workspace may be a clone rather than a linked worktree, so
    // the shape of the checkout is not the tell — the strategy is.
    const { ok, reason } = classifyCheckout({ ...shared, strategy: "git_worktree" });
    expect(ok).toBe(true);
    expect(reason).toContain("git_worktree");
  });

  it("still blocks when the strategy is the one that shares the tree", () => {
    expect(classifyCheckout({ ...shared, strategy: "project_primary" }).ok).toBe(false);
  });

  it("honours the escape hatch for a deliberate exception", () => {
    expect(classifyCheckout({ ...shared, overridden: true }).ok).toBe(true);
  });

  it("does not let the escape hatch matter outside an agent run", () => {
    // Nothing to override — the guard was never going to fire.
    expect(classifyCheckout({ ...shared, isPaperclipRun: false, overridden: false }).ok).toBe(true);
  });
});

describe("isMainWorktree", () => {
  it("is true when the git dir and the common dir are the same path", () => {
    const git = (args) => (args.includes("--git-common-dir") ? "/repo/.git" : "/repo/.git");
    expect(isMainWorktree(git)).toBe(true);
  });

  it("is false when the git dir is a linked worktree's own directory", () => {
    const git = (args) =>
      args.includes("--git-common-dir") ? "/repo/.git" : "/repo/.git/worktrees/pli-15";
    expect(isMainWorktree(git)).toBe(false);
  });

  it("agrees with git about the worktree it is actually running in", () => {
    // A real call, so a git version that changed the flags is caught here
    // rather than in a hook at commit time.
    expect(typeof isMainWorktree()).toBe("boolean");
  });
});

describe("the CLI", () => {
  const run = (env) => {
    try {
      const stdout = execFileSync("node", ["scripts/check-worktree.mjs"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PLICA_ALLOW_SHARED_CHECKOUT: "",
          PAPERCLIP_WORKSPACE_CWD: "",
          // Pinned, not inherited: once the instance turns on isolated
          // workspaces the ambient value changes, and these cases are about
          // the shared tree.
          PAPERCLIP_WORKSPACE_STRATEGY: "project_primary",
          ...env,
        },
      });
      return { code: 0, stdout };
    } catch (err) {
      return { code: err.status, stderr: err.stderr };
    }
  };

  it("exits 0 outside a Paperclip run", () => {
    expect(run({}).code).toBe(0);
  });

  it("exits 0 in a linked worktree even during a run", () => {
    // The suite runs from whichever worktree the agent is in; when that is a
    // linked one the guard must stay quiet, which is the case that matters.
    const { code } = run({ PAPERCLIP_WORKSPACE_CWD: "/tmp/anywhere" });
    if (isMainWorktree()) {
      expect(code).toBe(1);
    } else {
      expect(code).toBe(0);
    }
  });

  it("points at CONTRIBUTING.md when it does block", () => {
    const { code, stderr } = run({ PAPERCLIP_WORKSPACE_CWD: "/tmp/anywhere" });
    if (code === 1) {
      expect(stderr).toContain("git worktree add");
      expect(stderr).toContain("CONTRIBUTING.md");
    }
  });
});
