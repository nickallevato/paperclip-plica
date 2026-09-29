import { describe, expect, it } from "vitest";

import { bumpFor, classifySubject, nextVersion, planRelease, unreleasedBody } from "./plan-release.mjs";

describe("classifySubject", () => {
  it("reads the bump off the conventional type", () => {
    expect(classifySubject("feat: a thing").level).toBe("minor");
    expect(classifySubject("fix: a thing").level).toBe("patch");
    expect(classifySubject("perf: a thing").level).toBe("patch");
    expect(classifySubject("revert: a thing").level).toBe("patch");
  });

  it("releases nothing for a type a reader would not care about", () => {
    for (const type of ["chore", "docs", "ci", "test", "build", "style", "refactor"]) {
      expect(classifySubject(`${type}: a thing`).level, type).toBe("none");
    }
  });

  it("ignores the scope, and the squash-merge PR number", () => {
    expect(classifySubject("feat(board): the left rail spends the height it has (#46)").level).toBe(
      "minor",
    );
    expect(classifySubject("fix(release): stop reading npm's 404 as a field mismatch (#45)").level).toBe(
      "patch",
    );
  });

  it("treats the release commit as no release, so a cut cannot loop", () => {
    expect(classifySubject("chore(release): 0.8.0 (#48)").level).toBe("none");
  });

  it("takes a breaking change from the bang or the footer", () => {
    expect(classifySubject("feat!: drop the old route").level).toBe("major");
    expect(classifySubject("feat(ui)!: drop the old route").level).toBe("major");
    expect(classifySubject("fix: tighten a type", "BREAKING CHANGE: the config key moved").level).toBe(
      "major",
    );
  });

  it("releases nothing for a subject that is not conventional at all", () => {
    expect(classifySubject("Update the board").level).toBe("none");
    expect(classifySubject("Merge branch 'main' into topic").level).toBe("none");
  });
});

describe("bumpFor", () => {
  it("takes the largest bump any commit asks for", () => {
    expect(
      bumpFor([{ subject: "fix: a" }, { subject: "feat: b" }, { subject: "docs: c" }]).level,
    ).toBe("minor");
    expect(bumpFor([{ subject: "fix: a" }, { subject: "chore: b" }]).level).toBe("patch");
    expect(bumpFor([{ subject: "feat: a" }, { subject: "fix!: b" }]).level).toBe("major");
  });

  it("reports only the commits that asked for a version", () => {
    const { releasing } = bumpFor([
      { subject: "docs: readme" },
      { subject: "feat: b" },
      { subject: "ci: pin the runner" },
    ]);
    expect(releasing).toEqual([{ subject: "feat: b", level: "minor" }]);
  });

  it("releases nothing from an empty range", () => {
    expect(bumpFor([]).level).toBe("none");
  });
});

describe("nextVersion", () => {
  it("bumps within 0.x", () => {
    expect(nextVersion("0.8.0", "patch")).toBe("0.8.1");
    expect(nextVersion("0.8.1", "minor")).toBe("0.9.0");
    expect(nextVersion("0.9.5", "minor")).toBe("0.10.0");
  });

  it("holds a pre-1.0 breaking change to a minor bump", () => {
    // Reaching 1.0.0 says the plugin is finished; a `feat!:` subject does not
    // get to say that.
    expect(nextVersion("0.8.0", "major")).toBe("0.9.0");
  });

  it("bumps the major once there is one", () => {
    expect(nextVersion("1.4.2", "major")).toBe("2.0.0");
    expect(nextVersion("1.4.2", "minor")).toBe("1.5.0");
    expect(nextVersion("1.4.2", "patch")).toBe("1.4.3");
  });
});

describe("unreleasedBody", () => {
  it("takes the entries between Unreleased and the next heading", () => {
    const text = [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "- **A thing.** It happened.",
      "",
      "## 0.8.0",
      "",
      "- **An older thing.**",
    ].join("\n");
    expect(unreleasedBody(text)).toBe("- **A thing.** It happened.");
  });

  it("is empty when the section is empty", () => {
    expect(unreleasedBody("# Changelog\n\n## Unreleased\n\n## 0.8.0\n\n- old\n")).toBe("");
  });

  it("is empty when there is no such section", () => {
    expect(unreleasedBody("# Changelog\n\n## 0.8.0\n\n- old\n")).toBe("");
  });

  it("reads the last section when nothing follows it", () => {
    expect(unreleasedBody("# Changelog\n\n## Unreleased\n\n- **A thing.**\n")).toBe("- **A thing.**");
  });
});

describe("planRelease", () => {
  const facts = (over = {}) => ({
    currentVersion: "0.8.0",
    commits: [{ subject: "feat: a thing" }],
    unreleased: "- **A thing.** It happened.",
    existingTags: ["v0.8.0"],
    ...over,
  });

  it("plans the next version and carries the changelog prose as the notes", () => {
    const plan = planRelease(facts());
    expect(plan).toMatchObject({
      release: true,
      level: "minor",
      version: "0.9.0",
      tag: "v0.9.0",
      notes: "- **A thing.** It happened.",
    });
  });

  it("releases nothing when no commit asked for a version", () => {
    const plan = planRelease(facts({ commits: [{ subject: "docs: readme" }] }));
    expect(plan.release).toBe(false);
    expect(plan.version).toBe("0.8.0");
    expect(plan.reasons[0]).toMatch(/none of them a feat, fix, perf or revert/);
  });

  it("says so in the pull request's own terms when planning one title", () => {
    const plan = planRelease(
      facts({ commits: [{ subject: "docs: readme" }], oneSubject: true }),
    );
    expect(plan.release).toBe(false);
    expect(plan.reasons[0]).toBe(
      '"docs: readme" is not a feat, fix, perf or revert — merging it publishes nothing',
    );
  });

  it("releases nothing when nothing has landed", () => {
    const plan = planRelease(facts({ commits: [] }));
    expect(plan.release).toBe(false);
    expect(plan.reasons[0]).toMatch(/nothing has landed since 0\.8\.0/);
  });

  it("falls back to the merge subjects when there are no changelog entries, and says so", () => {
    const plan = planRelease(facts({ unreleased: "" }));
    expect(plan.release).toBe(true);
    expect(plan.notes).toBe("- feat: a thing");
    expect(plan.reasons.join("\n")).toMatch(/no Unreleased entries/);
  });

  it("refuses a version whose tag already exists", () => {
    const plan = planRelease(facts({ existingTags: ["v0.8.0", "v0.9.0"] }));
    expect(plan.release).toBe(false);
    expect(plan.reasons[0]).toMatch(/v0\.9\.0 already exists/);
  });

  it("refuses to guess the next number out of a prerelease", () => {
    const plan = planRelease(facts({ currentVersion: "0.9.0-rc.1" }));
    expect(plan.release).toBe(false);
    expect(plan.reasons[0]).toMatch(/prerelease/);
  });

  it("names every commit that asked for a version, so the reason is auditable", () => {
    const plan = planRelease(
      facts({ commits: [{ subject: "feat: a" }, { subject: "fix: b" }, { subject: "chore: c" }] }),
    );
    expect(plan.reasons).toContain("minor: feat: a");
    expect(plan.reasons).toContain("patch: fix: b");
    expect(plan.reasons.join("\n")).not.toMatch(/chore: c/);
  });
});
