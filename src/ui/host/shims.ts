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

export type OptionalCompany = {
  selectedCompanyId: string | null;
  companyPrefix: string | null;
} | null;

/**
 * Mirrors the host's `useOptionalCompany()` — the read half only.
 *
 * The host's version also exposes `setSelectedCompanyId`, which plugin UI
 * cannot reach. Nothing needs it: the only caller was PlicaLink's company-flip
 * workaround, and cross-company navigation now goes through `hardNavigate`,
 * which lets the host re-derive the company from the URL on remount.
 *
 * On a plugin page the host context always carries the company whose prefix is
 * in the URL, so this is non-null in practice; the optional shape is kept so
 * ported call sites need no change.
 */
export function useOptionalCompany(): OptionalCompany {
  const host = useHostContext();
  return useMemo(
    () => (host.companyId
      ? { selectedCompanyId: host.companyId, companyPrefix: host.companyPrefix }
      : null),
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

export type NewIssueDefaults = {
  companyId?: string;
  /** Required to build the destination URL; the host takes only companyId. */
  companyPrefix?: string | null;
};

/**
 * Mirrors the host's `useDialogActions()` — the one action Plica uses.
 *
 * The host's `openNewIssue` flips React state on a dialog that lives in
 * DialogContext, which plugin UI cannot reach, and there is no URL that opens
 * it. So instead of a button that silently does nothing, this navigates to the
 * target company's issues page, where the ticket can be created.
 *
 * Panes are cross-company by nature, so this reuses PlicaLink's rule: a
 * different company means a full document load, because the host will not
 * re-sync the selected company from the URL after a manual switch.
 */
export function useDialogActions() {
  const nav = useHostNavigation();
  const company = useOptionalCompany();

  const openNewIssue = useCallback(
    (defaults: NewIssueDefaults = {}) => {
      const prefix = defaults.companyPrefix ?? company?.companyPrefix ?? null;
      const target = buildCompanyPath(prefix, "issues");

      if (defaults.companyId && company && company.selectedCompanyId !== defaults.companyId) {
        hardNavigate(target);
        return;
      }
      nav.navigate(target);
    },
    [company, nav],
  );

  return { openNewIssue };
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
/**
 * Only same-origin, root-relative paths may be handed to the browser. Paths
 * are built from server data (attention `subject.href`, issue identifiers),
 * so a malformed or hostile value must not become an off-site redirect.
 */
export function isSafeLocalPath(to: string): boolean {
  return /^\/(?![\/\\])/.test(to) && !/[\u0000-\u001f]/.test(to);
}

export function hardNavigate(to: string): void {
  if (!isSafeLocalPath(to)) return;
  window.location.assign(to);
}

export function navigateToCompanyPath(prefix: string | null | undefined, path: string): void {
  hardNavigate(buildCompanyPath(prefix, path));
}

/** Same-company navigation stays a normal SPA transition via the host router. */
export function useHostNavigate() {
  return useHostNavigation();
}
