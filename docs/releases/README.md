# Release notes

One page per version, written for someone deciding whether to upgrade: what
changed, what it means for them, and anything they have to do by hand.

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
6. Tag `v<version>` on `main`.
7. Publish from a clean checkout of that tag: `npm publish`. `prepublishOnly`
   typechecks, builds and tests first, so a red build never reaches the
   registry. A published version can never be reused — a bad release is fixed
   by the next one, not by republishing.
