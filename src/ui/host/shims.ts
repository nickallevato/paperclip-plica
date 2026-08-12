/**
 * Adapters from the host React contexts Plica used to consume onto the plugin
 * SDK bridge.
 *
 * Plugin bundles cannot import the host's context modules, but the SDK exposes
 * equivalent capabilities. Keeping the original hook names and return shapes
 * here means the ported components stay close to verbatim.
 */
import { useCallback, useMemo } from "react";
import {
  useHostContext,
  useHostNavigation,
  usePluginToast,
} from "@paperclipai/plugin-sdk/ui";

export type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastInput {
  id?: string;
  dedupeKey?: string;
  title: string;
  body?: string;
  tone?: ToastTone;
  ttlMs?: number;
  action?: { label: string; href: string };
}

/**
 * Host `ToastTone` and SDK `PluginToastTone` are currently the same four
 * values, so this is the identity mapping. It exists as a named seam (with a
 * test) so that if either vocabulary changes, the break surfaces here rather
 * than as silently untoned toasts.
 */
export function mapToneToPluginTone(tone: ToastTone | undefined): ToastTone {
  return tone ?? "info";
}

/** Mirrors the host's `useToastActions()` surface — Plica only uses pushToast. */
export function useToastActions() {
  const toast = usePluginToast();

  const pushToast = useCallback(
    (input: ToastInput): string | null =>
      toast({
        ...(input.id === undefined ? {} : { id: input.id }),
        ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
        title: input.title,
        ...(input.body === undefined ? {} : { body: input.body }),
        tone: mapToneToPluginTone(input.tone),
        ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs }),
        ...(input.action === undefined ? {} : { action: input.action }),
      }),
    [toast],
  );

  return { pushToast };
}

export type OptionalCompany = { id: string; prefix: string | null } | null;

/**
 * Mirrors the host's `useOptionalCompany()`.
 *
 * On a plugin page the host context always carries the company whose prefix is
 * in the URL, so this is never null in practice — but the optional shape is
 * kept so ported call sites need no change.
 */
export function useOptionalCompany(): OptionalCompany {
  const host = useHostContext();
  return useMemo(
    () => (host.companyId ? { id: host.companyId, prefix: host.companyPrefix } : null),
    [host.companyId, host.companyPrefix],
  );
}

/**
 * Mirrors the host's `useBreadcrumbs()`.
 *
 * The host owns breadcrumbs for plugin pages and already renders the plugin's
 * display name, so Plica's own `setBreadcrumbs` call becomes a no-op rather
 * than fighting host chrome for the same slot.
 */
export function useBreadcrumbs() {
  const setBreadcrumbs = useCallback((_crumbs: { label: string; href?: string }[]) => {
    // Intentionally empty — see doc comment.
  }, []);
  return { setBreadcrumbs };
}

/**
 * Mirrors the host's `useDialogActions()`.
 *
 * Plica used this only to open the host's global "new issue" dialog, which
 * lives in host context a plugin cannot reach. Rather than render a control
 * that silently does nothing, `openNewIssueDialog` is null and call sites hide
 * the affordance. Plica's other quick actions (comment, status change) go
 * through `host/api` and are unaffected.
 */
export function useDialogActions(): { openNewIssueDialog: null } {
  return { openNewIssueDialog: null };
}

export function buildCompanyPath(prefix: string | null | undefined, path: string): string {
  const cleaned = path.replace(/^\/+/, "");
  return prefix ? `/${prefix}/${cleaned}` : `/${cleaned}`;
}

/**
 * Navigate to a path under another company, with a full document load.
 *
 * This must NOT use SPA navigation. `shouldSyncCompanySelectionFromRoute`
 * (host: ui/src/lib/company-selection.ts) returns false whenever
 * `selectionSource === "manual"` and a company is already selected, and
 * `CompanyContext` only resets that back to `"bootstrap"` inside its
 * default-pick effect, which early-returns once a company is set. So after any
 * manual company switch, SPA navigation to a different prefix leaves the
 * sidebar and switcher pointing at the old company for the rest of the
 * session.
 *
 * A document load remounts the app, which restores correct route-driven
 * company sync without patching host code. Switching companies is a heavyweight
 * context change anyway, so the reload is honest rather than wasteful.
 */
export function navigateToCompanyPath(prefix: string | null | undefined, path: string): void {
  window.location.assign(buildCompanyPath(prefix, path));
}

/** Same-company navigation stays a normal SPA transition via the host router. */
export function useHostNavigate() {
  return useHostNavigation();
}
