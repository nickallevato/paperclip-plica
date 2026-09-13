import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  classifyCheckout,
  isMainWorktree,
  remedyFor,
  worktreePathFor,
} from "./check-worktree.mjs";

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
    // Set, so the case is real: outside a run the guard was never going to
    // fire, and the reason must say so rather than crediting the override with
    // a pass it did not give.
    const { ok, reason } = classifyCheckout({ ...shared, isPaperclipRun: false, overridden: true });
    expect(ok).toBe(true);
    expect(reason).toBe("not a Paperclip agent run");
  });
});

describe("isMainWorktree", () => {
  it("is true when the git dir and the common dir are the same path", () => {
    // The mock answers per flag and records what it was asked, so this fails
    // if the two lookups ever collapse into one — returning a fixed string for
    // both arms would pass no matter which flags the code sent.
    const asked = [];
    const git = (args) => {
      asked.push(args);
      if (args.includes("--git-common-dir")) return "/repo/.git";
      if (args.includes("--absolute-git-dir")) return "/repo/.git";
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };
    expect(isMainWorktree(git)).toBe(true);
    expect(asked).toHaveLength(2);
    expect(asked.some((a) => a.includes("--absolute-git-dir"))).toBe(true);
    expect(asked.some((a) => a.includes("--git-common-dir"))).toBe(true);
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

});

// The remedy the failure message prints is the whole value of the guard: an
// agent that cannot follow it reaches for PLICA_ALLOW_SHARED_CHECKOUT=1
// instead. So run it, in a repository shaped like the one it is written for —
// a main worktree, on a topic branch, with the commit already staged.
describe("the remedy it prints", () => {
  const BRANCH = "pli-99/topic";
  const script = join(process.cwd(), "scripts", "check-worktree.mjs");
  const roots = [];

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  /** A fresh repo on BRANCH with a staged change, plus the guard's verdict on it. */
  const fixture = () => {
    const root = mkdtempSync(join(tmpdir(), "plica-worktree-"));
    roots.push(root);
    const repo = join(root, "plica");
    const sh = (cmd) => execFileSync("sh", ["-c", cmd], { cwd: repo, encoding: "utf8" });

    execFileSync("git", ["init", "-q", "-b", "main", repo]);
    sh("git config user.email a@b.c && git config user.name t && git config commit.gpgsign false");
    writeFileSync(join(repo, "file.txt"), "committed\n");
    sh("git add file.txt && git commit -qm initial --no-verify");
    sh(`git checkout -q -b ${BRANCH}`);
    writeFileSync(join(repo, "file.txt"), "in flight\n");
    sh("git add file.txt");

    return { root, repo, sh };
  };

  const guard = (repo) => {
    try {
      execFileSync("node", [script], {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PLICA_ALLOW_SHARED_CHECKOUT: "",
          PAPERCLIP_WORKSPACE_CWD: repo,
          PAPERCLIP_WORKSPACE_STRATEGY: "project_primary",
        },
      });
      return { code: 0, stderr: "" };
    } catch (err) {
      return { code: err.status, stderr: err.stderr };
    }
  };

  it("blocks, and names the branch and CONTRIBUTING.md", () => {
    const { repo } = fixture();
    const { code, stderr } = guard(repo);
    expect(code).toBe(1);
    expect(stderr).toContain(BRANCH);
    expect(stderr).toContain("CONTRIBUTING.md");
  });

  it("does not print the start-of-work command, which cannot work here", () => {
    // `git worktree add -b <branch>` is how CONTRIBUTING.md says to *start*
    // work. Offered at this point it fails — the branch exists, and is checked
    // out right here — and a worktree cut from origin/main would leave the
    // staged change behind besides.
    const { repo } = fixture();
    expect(guard(repo).stderr).not.toContain("worktree add -b");
  });

  it("runs clean, and lands the staged change on the branch in a worktree", () => {
    const { repo, sh } = fixture();
    const stderr = guard(repo).stderr;

    // Exactly the lines the agent is shown, in order, in one shell.
    const lines = remedyFor(BRANCH);
    for (const line of lines) expect(stderr).toContain(line);
    sh(`set -e\n${lines.join("\n")}`);

    const worktree = join(repo, worktreePathFor(BRANCH));
    const at = (cmd) => execFileSync("sh", ["-c", cmd], { cwd: worktree, encoding: "utf8" }).trim();

    expect(at("git rev-parse --abbrev-ref HEAD")).toBe(BRANCH);
    expect(at("git diff --cached --name-only")).toBe("file.txt");
    expect(at("cat file.txt")).toBe("in flight");

    // And the shared tree is back where it belongs, with nothing left to lose.
    expect(sh("git rev-parse --abbrev-ref HEAD").trim()).toBe("main");
    expect(sh("git status --porcelain").trim()).toBe("");
  });

  it("leaves the guard quiet in the worktree it just sent you to", () => {
    const { repo, sh } = fixture();
    sh(`set -e\n${remedyFor(BRANCH).join("\n")}`);
    expect(guard(join(repo, worktreePathFor(BRANCH))).code).toBe(0);
  });
});
