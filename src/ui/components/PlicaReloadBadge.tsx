import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import manifest from "../../manifest";
import { ApiError, pluginSelfApi } from "../host/api";
import { checkPluginReload, type PluginReloadCheck } from "../lib/plugin-reload";

const BUNDLED = { version: manifest.version, capabilities: manifest.capabilities };

const CHIP =
  "inline-flex items-center gap-1 rounded-full border border-plica-wait/40 bg-plica-wait/10 px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold uppercase tracking-(--tracking-label) text-plica-wait";

/**
 * Offers to reload Plica when the build on disk is newer than the one
 * Paperclip has registered — the step that otherwise takes a DevTools snippet
 * after `git pull && pnpm build`. See `lib/plugin-reload`.
 *
 * A chip beside "Stylesheet stale", same shape and same rule: silent unless
 * the answer is definite. Demo mode never reaches the network, so the read
 * fails there and the chip stays hidden.
 */
export function PlicaReloadBadge({ check: injected, onReloaded }: {
  /** Injectable for tests and for a reviewer wanting to see the chip. */
  check?: PluginReloadCheck;
  /** What to do once the host has taken the new build. Defaults to a page reload. */
  onReloaded?: () => void;
} = {}) {
  const installed = useQuery({
    queryKey: ["plica", "plugin-self"],
    queryFn: pluginSelfApi.get,
    enabled: injected === undefined,
    staleTime: Infinity,
    retry: false,
  });
  const reload = useMutation({
    mutationFn: pluginSelfApi.upgrade,
    // The host bumps the registration's updatedAt, which is the cache key on
    // the bundle URL, so a plain reload fetches the new build.
    onSuccess: onReloaded ?? (() => window.location.reload()),
  });

  const check = injected ?? checkPluginReload(BUNDLED, installed.data);

  if (check.status === "reinstall") {
    const detail =
      `Plica ${check.bundled} is built on disk but Paperclip still has ${check.installed} registered. ` +
      `It adds capabilities (${check.added.join(", ")}), which Paperclip only grants on a fresh install — ` +
      `uninstall and reinstall Plica from the plugin manager.`;
    return (
      <span role="alert" title={detail} className={CHIP}>
        <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
        Reinstall needed
        <span className="sr-only">{detail}</span>
      </span>
    );
  }

  if (check.status !== "reload") return null;

  const error = reload.error
    ? reload.error instanceof ApiError && reload.error.status === 403
      ? "Only an instance admin can reload Plica."
      : `Reload failed: ${reload.error.message}`
    : null;
  const detail =
    `Plica ${check.bundled} is built on disk; Paperclip is still running ${check.installed}. ` +
    `Reloading re-reads the plugin from disk in place — settings are kept.`;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        title={detail}
        disabled={reload.isPending}
        onClick={() => reload.mutate()}
        className={`${CHIP} hover:bg-plica-wait/20 disabled:opacity-60`}
      >
        <RefreshCw className={`h-3 w-3 shrink-0${reload.isPending ? " animate-spin" : ""}`} aria-hidden="true" />
        {reload.isPending ? "Reloading…" : `Reload ${check.bundled}`}
        <span className="sr-only">{detail}</span>
      </button>
      {error && (
        <span role="alert" className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] text-plica-wait">
          {error}
        </span>
      )}
    </span>
  );
}
