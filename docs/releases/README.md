# Release notes

One page per version, written for someone deciding whether to upgrade: what
changed, what it means for them, and anything they have to do by hand.

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
   (publisher: GitHub Actions, repository `nickallevato/paperclip-plica`,
   workflow `release.yml`), and delete `NPM_TOKEN`. This is the preferred
   arrangement — there is no secret for an agent, a log, or a compromised
   runner to leak, and publishes stay attributable to a specific workflow run.
3. **`~/.npmrc`** — an interactive `npm login`. Local runs only; the script
   refuses to fall back to it unattended.

Either of the first two also gets the release [provenance][trusted]: npm
records which commit and which workflow run built the tarball, and shows it on
the package page.

[tokens]: https://docs.npmjs.com/about-access-tokens
[trusted]: https://docs.npmjs.com/trusted-publishers
