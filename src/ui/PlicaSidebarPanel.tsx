import { Telescope } from "lucide-react";
import { useHostNavigate, useOptionalCompany } from "./host/shims";
import { buildCompanyPath } from "./host/shims";

/**
 * Sidebar entry point for Plica, rendered in the host's `sidebarPanel` zone —
 * below the Company section, outside the company-scoped Work list, which suits
 * a cross-company view.
 *
 * This is a slot component rather than a launcher because the host mounts only
 * `PluginSlotOutlet` for `sidebarPanel` (Sidebar.tsx) — there is no launcher
 * outlet in that zone. The upside is that a component can render its own icon,
 * which launcher declarations cannot: they have no icon field, so the Work-zone
 * launcher showed no glyph at all.
 *
 * The host wraps each panel item in `rounded-lg border border-border p-3`, so
 * this renders as bare content and inherits that frame.
 */
export function PlicaSidebarPanel({
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
        // Plica lives under the current company prefix, so this is always a
        // same-company hop — a normal SPA transition, no reload needed.
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        nav.navigate(href);
      }}
      className="flex items-center gap-2 text-(length:--text-compact) font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Plica — all companies"
    >
      <Telescope className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">Plica</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide opacity-60">all</span>
    </a>
  );
}
