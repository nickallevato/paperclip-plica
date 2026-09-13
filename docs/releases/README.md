# Release notes

One page per version, written for someone deciding whether to upgrade: what
changed, what it means for them, and anything they have to do by hand.

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
6. Tag `v<version>` on `main`.

There is no published package to release to — Plica installs from a path, so a
tag and these notes are the whole of it.
