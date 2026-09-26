/**
 * Detects that the Plica build on disk is newer than the one Paperclip has
 * registered, so the page can offer to reload it.
 *
 * Why this exists: Paperclip's dev watcher restarts Plica's worker when files
 * change, and the page picks up a rebuilt bundle on the next load — but the
 * manifest (version, capabilities, slots) is read once at install and kept in
 * the database. After a `git pull && pnpm build` that bumps the version, the
 * code is new and the registration is not. The fix is the host's
 * `POST /api/plugins/:id/upgrade`, which for a local-path install re-reads the
 * manifest from disk in place (no uninstall, settings kept). Paperclip's own
 * UI has no button for it, so Plica carries one.
 *
 * The version this bundle was built from is the ground truth for "on disk":
 * the page is running it.
 *
 * ## It fails open, deliberately
 *
 * Anything that cannot answer returns `"unknown"` and renders nothing: a
 * false "reload me" on every load teaches people to ignore the chip.
 */

export interface ManifestSummary {
  version: string;
  capabilities: readonly string[];
}

export type PluginReloadCheck =
  | { status: "current" | "unknown" }
  /** Newer build on disk; the host's upgrade endpoint can take it in place. */
  | { status: "reload"; installed: string; bundled: string }
  /**
   * Newer build on disk that declares capabilities the registration lacks.
   * The host refuses an in-place upgrade that escalates capabilities, so this
   * one needs an admin to reinstall from Paperclip's plugin manager.
   */
  | { status: "reinstall"; installed: string; bundled: string; added: string[] };

/** The slice of the host's plugin record this reads. */
export interface InstalledPluginRecord {
  version?: string | null;
  manifestJson?: { capabilities?: readonly string[] | null } | null;
}

export function checkPluginReload(
  bundled: ManifestSummary,
  installed: InstalledPluginRecord | null | undefined,
): PluginReloadCheck {
  const installedVersion = installed?.version;
  if (!installedVersion) return { status: "unknown" };
  if (installedVersion === bundled.version) return { status: "current" };
  // Only offer to move forward. An older bundle than the registration means
  // this tab is running a cached build, and "upgrading" to it would be wrong.
  if (compareVersions(bundled.version, installedVersion) <= 0) return { status: "current" };

  const installedCaps = installed?.manifestJson?.capabilities;
  if (!installedCaps) return { status: "unknown" };
  const have = new Set(installedCaps);
  const added = bundled.capabilities.filter((cap) => !have.has(cap));
  return added.length > 0
    ? { status: "reinstall", installed: installedVersion, bundled: bundled.version, added }
    : { status: "reload", installed: installedVersion, bundled: bundled.version };
}

/**
 * Numeric compare of dotted versions, ignoring any pre-release suffix.
 * Returns a negative, zero or positive number like `Array#sort` expects.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split("-")[0]!.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
