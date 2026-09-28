/**
 * Decides whether a newer Tickler than the installed one has been published to
 * npm, so the page can offer to update to it.
 *
 * Why this exists: Paperclip's plugin manager installs from npm and has no
 * "update" button, so the only way to move from 0.6.0 to 0.7.1 was uninstall
 * and reinstall — which drops the plugin's config row and its per-company
 * settings on the floor. The host does have the right primitive:
 * `POST /api/plugins/:id/upgrade` re-runs `npm install <pkg>@<version>` into
 * the managed plugin directory, re-reads the manifest and re-registers in
 * place, keeping config. Nothing in Paperclip's UI calls it, so Tickler carries
 * the button.
 *
 * This is the npm half of the same question `lib/plugin-reload` asks about a
 * local build. The two are mutually exclusive, and `packagePath` is what tells
 * them apart: the host stores it only for a local-path install (plugin-loader,
 * `installPlugin` — `packagePath: source === "local-filesystem" ? … :
 * undefined`), and for those the upgrade endpoint re-reads that directory
 * rather than fetching from npm. A published version is not that install's
 * source of truth, so this check stands down and the reload badge owns it.
 *
 * ## It fails open, deliberately
 *
 * A self-hosted instance may have no route to registry.npmjs.org, and npm may
 * answer slowly or not at all. Anything this cannot answer is `"unknown"`, and
 * an unknown never renders an update affordance: a button that 400s because the
 * version behind it was a guess is worse than no button.
 */
import { compareVersions, type InstalledPluginRecord } from "./plugin-reload";

/** Tickler's npm package. The manifest id is a different string by design. */
export const NPM_PACKAGE = "paperclip-plugin-tickler";

/**
 * The registry's metadata for the `latest` dist-tag.
 *
 * Read from the browser, so it has to be an endpoint npm serves with CORS:
 * `/<pkg>/latest` answers `access-control-allow-origin: *`, while the smaller
 * `/-/package/<pkg>/dist-tags` sends no CORS header at all and is unreadable
 * from a page.
 */
export const NPM_LATEST_URL = `https://registry.npmjs.org/${NPM_PACKAGE}/latest`;

export type SelfUpdateCheck =
  /** No registration, no answer from npm, or an unreadable one. Renders nothing. */
  | { status: "unknown" }
  /** Installed from a local path; `lib/plugin-reload` owns this install's updates. */
  | { status: "local"; installed: string }
  | { status: "current"; installed: string }
  /** A newer version is published and the host can take it in place. */
  | { status: "available"; installed: string; latest: string };

export function checkSelfUpdate(
  installed: InstalledPluginRecord | null | undefined,
  latest: string | null | undefined,
): SelfUpdateCheck {
  const installedVersion = installed?.version;
  if (!installedVersion) return { status: "unknown" };
  if (installed?.packagePath) return { status: "local", installed: installedVersion };
  if (!latest) return { status: "unknown" };
  return compareVersions(latest, installedVersion) > 0
    ? { status: "available", installed: installedVersion, latest }
    : { status: "current", installed: installedVersion };
}
