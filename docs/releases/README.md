# Release notes

One page per version, written for someone deciding whether to upgrade: what
changed, what it means for them, and anything they have to do by hand.

- [0.8.0](0.8.0.md) — Tickler updates itself from a button, and the board's left
  rail spends the height it has.
- [0.7.1](0.7.1.md) — the board's left column is no longer cut off at the bottom.
- [0.7.0](0.7.0.md) — Plica is now Tickler: new package name, plugin id and route.
- [0.6.0](0.6.0.md) — no plugin change: the first release published by pushing a
  tag, not by hand.
- [0.5.0](0.5.0.md) — on npm: install from the Plugin Manager by name, and no more
  rebuilding after a Paperclip upgrade. Recent replaces the live strip.
- [0.4.0](0.4.0.md) — the queue owns the page: decide-by lanes backed by
  Paperclip's decision triage, the Orgs list, a calmer board.
- [0.3.0](0.3.0.md) — demo mode, the live strip, the portfolio chart, routine
  exceptions, queue age filters.
- 0.2.0 — the board. See the [changelog](../../CHANGELOG.md#020).
- 0.1.0 — initial release.

The [changelog](../../CHANGELOG.md) is the short form and covers every version.

## Cutting a release

1. Land everything for the version, with its changelog entries under
   **Unreleased**.
2. Rename that heading to the version number and open a fresh Unreleased.
3. Set the same version in `package.json` **and** `src/manifest.ts` — the host
   reads the manifest, `pnpm install` reads the package, and a mismatch is
   invisible until someone reports the wrong version in `plugin list`.
4. Refresh the screenshots if the UI moved:
   `node scripts/capture-screenshots.mjs` (see
   [screenshots/README.md](../screenshots/README.md)).
5. Write the release page here.
6. Check the version is declared consistently before tagging anything:
   `pnpm check:release`. It compares `package.json`, `src/manifest.ts`, the
   changelog heading and the release page, and says which one is behind.
7. Tag `v<version>` on `main` and push the tag.

Pushing the tag is the release. The
[`release` workflow](../../.github/workflows/release.yml) picks it up, installs
against the pinned Paperclip core the way CI does, and publishes. A published
version can never be reused — a bad release is fixed by the next one, not by
republishing — so the workflow refuses to publish a tag that disagrees with
`package.json`, a tree that is not clean, or a version with no changelog entry
or release page. `prepublishOnly` typechecks, builds and tests inside
`npm publish` itself, so a red build cannot reach the registry either.

To rehearse without releasing, run the workflow by hand from the Actions tab
with **dry run** left on: it packs the tarball and runs every check, and
publishes nothing.

If the run fails before the registry accepted the tarball, the version is still
free and the tag is still correct — there is nothing to re-tag. Fix the cause,
then run the workflow by hand with the **tag** input set to `v<version>` and
**dry run** unchecked. Deleting and re-pushing the tag would work too, but it
rewrites a tag other checkouts may already have fetched.

## Publishing by hand

The workflow and a person run the same script, so this is the fallback when
Actions is unavailable, not a second procedure:

```bash
git fetch --tags && git checkout v<version>
pnpm install --frozen-lockfile
pnpm release:publish --tag v<version>          # add --dry-run to rehearse
```

It refuses the same things the workflow does, and authenticates with whatever
`npm login` left in `~/.npmrc` — or, for an agent, with the npm token bound to
it (see below); the script prints which.

## Publishing credentials

`scripts/publish-npm.mjs` takes a credential from one of three places, in this
order, and prints the name of the one it used:

1. **A token on the environment** — an npm [automation token][tokens], read
   from `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `NPM_TOKEN_90_DAY_EXP`, whichever is
   set first. Write-scoped to the registry and long-lived, so it is the thing
   worth not having. The script never writes it into the repository: it goes to
   a private temporary npm config that is deleted when the script exits.

   `NPM_TOKEN` is the repository Actions secret that `release.yml` passes to the
   publish step, and the one to set for CI releases. `NODE_AUTH_TOKEN` is the
   same thing under the name `actions/setup-node` uses. `NPM_TOKEN_90_DAY_EXP`
   is how Paperclip delivers the credential to an agent on a release task: its
   secrets arrive under the name they were stored as, so the script knows that
   name rather than an agent copying a token between variables. A Paperclip
   secret is bound to agents only — it does not reach GitHub Actions, so a tag
   push still needs the repository secret.
2. **Trusted publishing** — npm's [OIDC][trusted] link between the package and
   this workflow. No token exists anywhere: npm accepts the publish because
   GitHub attests that it came from `release.yml` on this repository. Set it up
   once under the package's **Settings → Trusted publishers** on npmjs.com
   (publisher: GitHub Actions, repository `nickallevato/paperclip-tickler`,
   workflow `release.yml`), and delete `NPM_TOKEN`. This is the preferred
   arrangement — there is no secret for an agent, a log, or a compromised
   runner to leak, and publishes stay attributable to a specific workflow run.
3. **`~/.npmrc`** — an interactive `npm login`. Local runs only; the script
   refuses to fall back to it unattended.

Either of the first two also gets the release [provenance][trusted]: npm
records which commit and which workflow run built the tarball, and shows it on
the package page.

### What npm's two credential errors actually mean

Both of these were hit trying to publish 0.6.0, and neither error says what is
wrong. `scripts/publish-npm.mjs` now prints the matching explanation after a
failed publish, but they are worth recognising:

- **`ENEEDAUTH` — "You need to authorize this machine using `npm adduser`"**, in
  a workflow run. Nothing is wrong with the machine. No `NPM_TOKEN` was set, so
  the job fell to trusted publishing, and npm only honours that once the package
  lists this workflow under **Trusted publishers**. Configure it there, or set
  the repository secret.

  The same error also means "the entry exists but does not match this run", and
  the two cases are indistinguishable — not only from `ENEEDAUTH`, but from the
  registry too: measured on 2026-09-28, the exchange answers `HTTP 404 OIDC
  token exchange error - package not found` for both. Do not read that 404 as
  "there is no entry". What the registry's answer *is* good for is its status
  and wording, which npm throws away, and the run's own OIDC claims. A failed
  publish on this path now prints both, and the probe can be run on its own:

  ```
  node scripts/diagnose-npm-oidc.mjs
  ```

  It needs a job with `id-token: write`;
  [`npm oidc diagnostic`](../../.github/workflows/npm-oidc-diagnostic.yml) is
  that job, dispatched by hand from the Actions tab, and it cannot publish. The
  script makes the same two requests `npm publish` does — mint an OIDC token,
  trade it for a publish credential — reports the registry's own status and
  message, prints the `repository`, `repository_owner`, `workflow_ref` and
  `environment` claims this run presents, and publishes nothing. Compare those
  claims with the npmjs.com entry field by field; that comparison, not the
  status code, is what tells the two cases apart. If it says npm *accepted* the
  token, trusted publishing is configured correctly and the refusal was
  something else.

  **A rename is the trap.** `nickallevato/paperclip-plica` →
  `nickallevato/paperclip-tickler` kept the same repository id, and GitHub
  redirects everything, but npm matches entries on the name — so the entry that
  published `paperclip-plugin-plica@0.6.0` silently stopped matching. Renaming
  the repository or the account means re-entering every trusted publisher.

  Failing that, or before re-reading the npm page, rule the workflow side out —
  every one of these was checked on the run that first hit it, and all of them
  held:

  | requirement | how to check it |
  | --- | --- |
  | npm CLI ≥ 11.5.1, Node ≥ 22.14 | the `setup-node` step prints both |
  | `id-token: write` on the job | `permissions:` in `release.yml` |
  | a GitHub-hosted runner | self-hosted runners cannot use OIDC at all |
  | `repository.url` matching the repo | `package.json` |

  On the npm side the entry is matched exactly and case-sensitively: the
  **workflow filename** is the bare name with its extension (`release.yml`, not
  a path), **environment** must be blank unless the job declares one, and
  **allowed actions** has to include `npm publish` — an entry limited to
  `npm stage publish` refuses an ordinary publish.
- **`E403` — "You may not perform that action with these credentials"**, with a
  token that works. The token authenticates (`npm whoami` answers, `npm access
  get status` answers) and is refused only on the write, which means it is
  read-only or read-scoped. Reissue it as an automation token, or a granular
  token with **read and write** on `paperclip-plugin-tickler`.

A version is only spent when the registry accepts the tarball, so neither of
these costs the version number: both failed after packing and the version stayed
free to publish once the credential was fixed.

[tokens]: https://docs.npmjs.com/about-access-tokens
[trusted]: https://docs.npmjs.com/trusted-publishers
