# Contributing to Plica

Plica is a Paperclip plugin. Everything below follows from that one fact.

> **Reporting something, rather than building something?** Open an issue from
> one of the templates and stop there — [`docs/intake.md`](docs/intake.md)
> describes what happens to it next, and which two decisions are the repository
> owner's. This document takes over once an issue is prioritized and someone
> cuts a branch.

## Never modify Paperclip core

**Plica never changes the Paperclip AI core application. Every change lands in
this repository, through a documented plugin extension point.**

Not by patching a core package. Not by committing a Paperclip checkout here.
Not by a build step that writes into `~/paperclip`. Not by a postinstall script
that rewrites something under `node_modules`. Not "temporarily", not "just to
unblock the demo".

### Why

Plica is installed alongside a Paperclip instance that its author upgrades on
their own schedule. A change that only works because core was edited to meet it
is a change that breaks on the next `git pull` upstream — silently, in someone
else's install, with no trace pointing back here. The plugin surface is the
contract; if Plica holds to it, a Paperclip upgrade can break Plica loudly (a
missing export, a failed typecheck) instead of quietly.

It also keeps the boundary honest in the other direction. The `@paperclipai/*`
`link:` dev dependencies mean Plica type-checks against a real Paperclip
checkout — that checkout is a *reference*, read-only. The moment we start
editing it to make Plica compile, it stops telling us anything true.

### What this permits

- Anything under `src/`, `scripts/`, `docs/`, `.github/`, `.githooks/`, and the
  repo's root configuration files.
- Reading from a Paperclip checkout at build time — `scripts/build-css.mjs`
  reads the host stylesheet to subtract its selectors. Reads are fine. Writes
  are not.
- `src/ui/host/` — read-only *copies* of core internals Paperclip does not
  export to plugins. Copying core source into Plica is not modifying core. Keep
  the copies byte-identical to upstream apart from import paths, and keep them
  under `src/ui/host/`; see the README's "Vendored host components" for the
  three documented exceptions.

### What this forbids

- `patch-package`, `pnpm patch`, `pnpm.patchedDependencies`, `patches/`, or any
  committed `.patch` / `.diff`.
- A Paperclip checkout, or a copy of a core package, committed into this repo
  outside `src/ui/host/`.
- Any script that writes above the repository root, into a home directory, or
  into a path naming a Paperclip checkout.
- New `link:`/`file:` dependencies beyond `@paperclipai/plugin-sdk` and
  `@paperclipai/shared`.
- Forking core, or maintaining a private branch of it that Plica depends on.

### When the plugin surface is not enough

This will happen. Some things Plica wants genuinely cannot be expressed through
the extension points core exposes today — an unexported component, a route the
host owns, a hook that does not exist.

**Stop. Do not route around it.** Shimming, monkey-patching, reaching into host
internals at runtime, or "just this one" core edit are all the same failure with
different spellings, and each one is invisible to whoever upgrades next.

Instead:

1. **Open a core-limitation issue** — the `Core limitation` issue template
   (`.github/ISSUE_TEMPLATE/core_limitation.yml`) asks for exactly this —
   describing what Plica needs, which extension point comes closest, and exactly
   why it falls short. Include the smallest change to core that would fix it —
   as a *request*, not a patch.
2. **Say what the fallback is** if core does not change: the degraded version
   Plica can ship inside the surface today, or nothing.
3. **Let the user decide.** Whether core changes is their call, not the
   contributor's. Park the work — do not merge a workaround while waiting.

A blocked feature is a much cheaper outcome than an install that breaks on
upgrade.

### How it is enforced

`scripts/check-plugin-surface.mjs` encodes the rules above and runs on every
pull request (`.github/workflows/plugin-surface.yml`). It checks changed paths
against the allowed plugin surface and scans changed files for patch tooling,
out-of-repo writes, and unsanctioned local dependency links.

```bash
pnpm check:surface     # scan the whole tree
node ./scripts/check-plugin-surface.mjs --base origin/main   # scan a branch
```

It is dependency-free on purpose. It runs on a bare runner in seconds, before
anything is installed, so the guardrail still reports even when the build is
broken or the pinned Paperclip checkout will not install — the two moments a
core edit is most tempting.

**There is no bypass.** No skip label, no `--force`, no opt-out comment. A
failing plugin-surface check means either the change belongs somewhere else in
the repo, or it is a core limitation to file. If the allowlist itself is wrong —
a legitimate new top-level directory, say — widen it in its own pull request
that explains why, and let that be reviewed on its own merits.

## Working on Plica

```bash
pnpm install
pnpm dev             # esbuild watch + CSS rebuild
pnpm test            # vitest
pnpm typecheck       # tsc --noEmit
pnpm build           # CSS then bundle
pnpm check:surface   # the guardrail above
pnpm check:branch    # branch name against the convention below
pnpm check:worktree  # not working in the checkout other agents share
pnpm hooks:install   # pre-commit: worktree, surface check, typecheck, test
```

The `@paperclipai/*` dev dependencies are `link:` references to a Paperclip
checkout, resolved at `../../paperclip` relative to this repository. If yours
lives elsewhere, repoint the two paths in `package.json` locally — but do not
commit that repoint. `pnpm build` additionally reads the host's *compiled*
stylesheet; point `PLICA_HOST_CSS` at `ui/dist/assets/index-*.css` in that
checkout if it is not under `~/paperclip`.

Rebuilding Paperclip's UI requires rebuilding Plica; the README's "The
stylesheet coupling" explains why, and it is the one operational rule worth
reading before you touch `scripts/build-css.mjs`.

## Documentation

The user-facing documentation lives in [`docs/`](docs/) and ships with the
plugin. A change that alters what someone sees or does belongs in the same pull
request as the change itself — install, configuration, board, queue,
troubleshooting, and a line in the changelog under **Unreleased**.

If the change moves the UI, refresh the screenshots. They are generated, not
hand-cropped:

```bash
node scripts/capture-screenshots.mjs
```

That needs a running instance with Plica installed; the recipe for standing up a
throwaway one is in [`docs/screenshots/README.md`](docs/screenshots/README.md).
Every image in `docs/` is Plica's own demo fixture, so nothing from a real
instance can end up in a published picture — keep it that way.

## The shared checkout

**If you are an agent: do not work in the checkout you were handed. Add a
worktree and work there.**

```bash
git worktree add -b pli-15/shared-checkout-isolation ../plica-pli-15 origin/main
cd ../plica-pli-15
```

Every agent in this company resolves to the same working copy. Paperclip runs
this project with `PAPERCLIP_WORKSPACE_STRATEGY=project_primary`, so each
agent's `PAPERCLIP_WORKSPACE_CWD` lands on the same `_default/plica` — one
`HEAD`, one index, one stash, shared by everyone running at once.

That makes branch switching destructive in a way git will not warn you about.
`git checkout` carries uncommitted changes across branches without complaint
when they do not conflict, so one agent switching branches can take another's
in-flight edits with it and commit them onto the wrong branch; a later
`git checkout -- .` or `git reset --hard` can discard them outright. Neither
agent sees an error and neither run fails. The work is simply not where anyone
looks for it. `git stash` is no help — it is global to the checkout too, so two
agents stashing race each other.

A worktree is the whole fix. It is a full checkout with its own `HEAD`, index
and stash, sharing the original's object store, so it costs a working copy on
disk and nothing else. Creating one does not move the shared tree's `HEAD`, so
adding yours cannot disturb work already in flight. Put it beside `plica/`
rather than inside it — anywhere unique outside the shared tree works, and
`../plica-<issue-key>` is what the tooling suggests. When the branch has
merged, `git worktree remove ../plica-<issue-key>` cleans it up.

What you may do in the shared checkout: read it, and run read-only git
commands. What you may not do: `checkout`, `switch`, `reset`, `stash`, or leave
uncommitted changes. Assume another agent is one command away from discarding
anything you leave there.

### If you are already on a topic branch here

The `git worktree add -b …` above starts work. It will not rescue work already
under way: the branch exists and is checked out right here, so git refuses
(`fatal: a branch named '…' already exists`), and a worktree cut from
`origin/main` would leave your uncommitted changes behind anyway. This is what
`pnpm check:worktree` prints when it blocks a commit, and it is the sequence to
run instead:

```bash
WIP=$(git stash create) && git reset --hard
git checkout main
git worktree add ../plica-<issue-key> <branch>
cd ../plica-<issue-key>
git stash apply --index "$WIP"
```

Then re-run your `git commit`; `--index` brings the staged state across, so
nothing needs re-adding.

`git stash create` rather than `git stash push` because the stash *ref* is
shared by every agent in this checkout — a `push`/`pop` pair here can pop
somebody else's stash. `create` writes a commit object and touches no ref, so
`$WIP` is yours alone for as long as the shell lives. Untracked files are not
in it and survive the reset; `git status` in the shared tree afterwards lists
whatever is left to move by hand.

`pnpm check:worktree` enforces the part that can be enforced. It runs in
`pre-commit` and fails a commit made on a topic branch in the shared checkout
during an agent run — human clones share their checkout with nobody, so it is a
no-op there. `PLICA_ALLOW_SHARED_CHECKOUT=1` overrides it for a deliberate
exception.

> **The guard is a backstop, not the guarantee.** Git has no pre-checkout hook,
> so nothing can veto the destructive command itself; the guard only keeps the
> shared tree from being where work lives, so there is less there to lose. The
> real fix is configuration, and it already exists in Paperclip — an execution
> workspace with `workspaceStrategy.type: "git_worktree"`, or a project
> `defaultMode: "isolated_workspace"`, which gives each run its own worktree
> with no convention for anyone to remember. Both sit behind the instance-level
> **Isolated Workspaces** experimental setting (`enableIsolatedWorkspaces`),
> which defaults off and which only the instance owner can turn on — agent
> credentials get `403 Board access required`.
>
> **The owner has agreed to turn it on** (PLI-15, 2026-09-05). That makes
> isolation the sanctioned mechanism here rather than a convention. It does not
> retire the rule above, for two reasons: agents cannot read the flag to confirm
> it, and the project still has to be pointed at an isolated mode before any
> run resolves to one. So read it off your own run instead —
> `PAPERCLIP_WORKSPACE_STRATEGY` says which working copy you were actually
> handed. While it reads `project_primary` you are in the shared tree and the
> rule binds; when it reads `git_worktree` the runtime already gave you your
> own, and the `git worktree add` above is redundant rather than wrong. Keep the
> guard either way — it costs nothing once runs are isolated, and it is the only
> thing standing between a shared run and a silent loss.

## Branches

One change per branch, branched from `main`.

```
<issue-key|type>/<kebab-slug>

pli-4/pr-workflow-and-review-gate     closes PLI-4
fix/board-row-overflow                no issue — a conventional-commit type
```

The prefix is the issue key the branch closes, or a conventional-commit type
(`feat`, `fix`, `docs`, `chore`, `refactor`, `perf`, `test`, `ci`, `build`,
`revert`) when there is no issue. The slug is lowercase kebab-case.

Naming a branch for its issue is how someone reading `git log` a year from now
finds the discussion behind a change, and how a reviewer facing a stack of
agent-opened pull requests can tell which one is the bug fix. `pnpm
check:branch` and the `branch name` CI job check it; renaming is
`git branch -m <new-name>` and a fresh push.

## Pull requests

- The description says **what** changed, **why**, and **how it was verified**.
  Paste the test or check output rather than asserting it passed. The template
  asks for exactly these three.
- Green CI: `branch name`, `plugin surface`, and `build and test`.
- If a change is worth documenting for users, say so in the description so it
  reaches the README and `CHANGELOG.md`.
- Auto-merge is enabled on the repository. `gh pr merge --auto` queues a merge
  for the moment the checks go green instead of polling them by hand; it
  respects whatever protection is in force, and anyone can cancel it before it
  fires. Merged
  branches are deleted automatically — remove the matching worktree too.

### The review gate

**Nothing reaches `main` unattended — and as of 2026-09-19 that is a rule we
keep, not a rule GitHub keeps for us.** `main` has **no branch protection rule
and no ruleset**. Direct pushes, force pushes and deletion are all permitted,
and a red check does not stop a merge. The three checks below still run on
every pull request; they just no longer block one.

So rebase onto `main` before merging even though nothing makes you — the checks
that passed should be the checks for the merge result — and never push to
`main` directly.

Do not take this paragraph's word for the current state; read it:

```
gh api repos/nickallevato/paperclip-plica/branches/main --jq .protected   # false
gh api repos/nickallevato/paperclip-plica/rulesets                        # []
```

Those two endpoints answer without the `Administration` permission, unlike
`/branches/main/protection`, which returns `403 Resource not accessible by
integration` to the agents' GitHub connection.

An agent opens the pull request. A second party — the user, or a reviewing
agent — approves it and merges it. **Nobody merges their own pull request**,
and no agent merges a pull request it opened. The value of the gate is that a
change is read by someone who did not write it; an agent approving its own work
is the gate deleting itself.

Approvals are dismissed when new commits land, so a review approves the diff
that merges, not an earlier one.

**Agents merge; the owner does not gate it.** The repository owner decided this
on PLI-16, 2026-09-13, choosing it over merging by hand: a reviewing agent that
did not write the pull request reads it, and if it finds nothing blocking and
the checks are green, that agent merges — no wait on the owner. The owner's
control is after the fact rather than in front of it, which on a repository
this size is the trade that keeps pull requests from queueing behind one
person: `main`'s history is public and every merge is revertable.

Two obligations come with it. The reviewing agent must actually read the diff —
the merge button is the only gate left, so "checks are green" is not a review.
And the review must be written down as a pull request comment before the merge,
because it is the only durable record that the reading happened; GitHub will
not record it as an approval (see below).

When two pull requests touch the same file, decide the merge order rather than
discovering it — whichever merges second rebases, and the agent that owns it
should be told, not left to find a conflict.

> **Why the approval half cannot simply be switched on.** There is no rule on
> `main` to switch it on in, and even once there is, the count has to stay `0`
> until the agents stop authenticating as the repository owner.
> GitHub will not let a pull request's
> author approve it, and agents currently authenticate as `nickallevato` — the
> same account that would review — so every agent-opened pull request has the
> reviewer as its author. Setting the count to `1` today would block every merge
> with no way to unblock it. The fix is a separate machine identity (a bot
> account or a GitHub App) for the agents to open pull requests as; the approval
> count goes to `1` once that exists. Until then the no-self-merge rule above is
> binding on contributors even though GitHub does not check it.
>
> This is not a guess about GitHub's behaviour — it was tried on PR #6 and the
> API refused it outright:
>
> ```
> failed to create review: GraphQL: Review Can not approve your own pull request
> ```
>
> So a reviewing agent posts its review as a **pull request comment**, which is
> why the rule above requires one. It carries no weight with GitHub and all the
> weight here. The machine identity is tracked in **PLI-12**; when it lands,
> these reviews become real approvals and `required_approving_review_count`
> can go to `1`, at which point the convention stops needing to be a
> convention. Two things are needed for that, not one: the machine identity,
> and a rule on `main` to set the count in — plus the `Administration`
> repository permission on the agents' GitHub connection, which it does not
> currently have.

### What CI runs

| Check | What it is for |
| --- | --- |
| `branch name` | The convention above. |
| `plugin surface` | The no-core-changes rule. Dependency-free, always runs. |
| `build and test` | `pnpm typecheck`, `pnpm build`, `pnpm test`. |

`build and test` needs a Paperclip checkout, because Plica's `@paperclipai/*`
dependencies are `link:` references to one and `pnpm build` filters Plica's
stylesheet against the host's compiled CSS. CI clones core read-only from the
public upstream at the commit pinned in `.github/paperclip-core.ref`.

That pin is a real dependency, so treat it like one: bumping it is its own pull
request, and CI going red on the bump is the point — it means a Paperclip
upgrade broke Plica loudly, here, instead of quietly in someone's install.

Build runs before test on purpose. `src/bundle.test.ts` asserts against
`dist/ui/index.js` and skips itself when that file is missing, so testing first
would silently drop the host-loader contract checks.

There is no lint step yet — the repository has no linter configured, and
`tsc --noEmit` covers most of what one would catch. Adding one is a dependency
decision that has not been made.
