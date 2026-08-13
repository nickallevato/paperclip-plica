import type { MouseEvent, ReactNode } from "react";
import { hardNavigate, useHostNavigate, useOptionalCompany } from "../host/shims";

/**
 * Plica deep link. `to` is always an already-company-prefixed path.
 *
 * Same-company clicks navigate through the host's SPA router. Cross-company
 * clicks do a FULL DOCUMENT LOAD, which is the plugin-side replacement for the
 * customization's `setSelectedCompanyId(id, { source: "route_sync" })` flip.
 *
 * Why the reload is necessary, and not just laziness: plugin UI cannot reach
 * the host's CompanyContext to flip the selection itself, and the host will not
 * flip it from the URL either — `shouldSyncCompanySelectionFromRoute`
 * (ui/src/lib/company-selection.ts) returns false whenever `selectionSource`
 * is "manual" with a company already selected, and CompanyContext only resets
 * that to "bootstrap" inside its default-pick effect, which early-returns once
 * a company is set. So after any manual company switch, an SPA hop to another
 * prefix would leave the sidebar and switcher on the old company for the rest
 * of the session. Remounting the app restores correct route-driven sync.
 *
 * Do not "optimize" this back into SPA navigation without fixing that upstream
 * guard first.
 *
 * Modifier clicks (ctrl/cmd/shift/middle) keep native new-tab behavior because
 * this stays a real anchor with a real href.
 */
export function PlicaLink({
  to,
  companyId,
  className,
  children,
  title,
  "aria-label": ariaLabel,
}: {
  to: string;
  companyId?: string;
  className?: string;
  children: ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  const nav = useHostNavigate();
  const company = useOptionalCompany();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();

    const isCrossCompany = Boolean(
      companyId && company && company.selectedCompanyId !== companyId,
    );

    if (isCrossCompany) {
      hardNavigate(to);
      return;
    }

    nav.navigate(to);
  };

  return (
    <a href={to} onClick={onClick} className={className} title={title} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
