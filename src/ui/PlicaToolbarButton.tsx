import { PlicaMark } from "./components/PlicaMark";
import { buildCompanyPath, useHostNavigate, useOptionalCompany } from "./host/shims";

/**
 * Global toolbar entry point for Plica.
 *
 * Renders in the host's `globalToolbarButton` zone — the BreadcrumbBar, which
 * Layout mounts above every page (Layout.tsx). That puts Plica in persistent
 * chrome rather than inside a company's sidebar navigation, which matches what
 * it is: a view across all companies, not one company's page.
 *
 * The host lays this zone out as `flex items-center gap-1` with no item
 * wrapper, so this renders its own compact button rather than bare content
 * (unlike the sidebarPanel zone, which supplies a bordered card frame).
 */
export function PlicaToolbarButton({
  context,
}: {
  context?: { companyPrefix?: string | null };
}) {
  const nav = useHostNavigate();
  const company = useOptionalCompany();
  const prefix = context?.companyPrefix ?? company?.companyPrefix ?? null;
  const href = buildCompanyPath(prefix, "plica");

  return (
    <a
      href={href}
      onClick={(event) => {
        // Plica always lives under the current company prefix, so this is a
        // same-company hop: a normal SPA transition, no document reload.
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        nav.navigate(href);
      }}
      title="Plica — all orgs"
      aria-label="Plica — all orgs"
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-(length:--text-compact) font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <PlicaMark className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden sm:inline">Plica</span>
    </a>
  );
}
