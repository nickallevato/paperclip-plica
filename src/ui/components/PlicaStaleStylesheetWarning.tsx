import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { checkHostStylesheet, type HostStylesheetCheck } from "../lib/host-stylesheet";

/**
 * Says that Plica's stylesheet was built against a different Paperclip than the
 * one running, and names the fix.
 *
 * A badge beside "Demo data" rather than a banner: the repository owner chose
 * the quieter shape on the rendered comparison (issue #5, Q2). The chip is what
 * a sighted reader sees, the whole message rides in its hover text, and an
 * `sr-only` copy carries the same message to assistive technology, which cannot
 * hover — the same pattern `PlicaCapacityStrip` uses for its summary.
 *
 * Renders nothing unless the answer is a definite mismatch — see
 * `lib/host-stylesheet` on why every uncertain path is silent.
 */
export function PlicaStaleStylesheetWarning({ check: injected }: {
  /** Injectable for tests and for a reviewer wanting to see the badge. */
  check?: HostStylesheetCheck;
} = {}) {
  // Once, at mount. The answer cannot change without a page load: it compares a
  // constant baked into this bundle against the document's <link> tags.
  const [resolved] = useState<HostStylesheetCheck>(() =>
    checkHostStylesheet(typeof document === "undefined" ? undefined : document),
  );
  const check = injected ?? resolved;
  if (check.status !== "mismatch" || !check.recorded || !check.observed) return null;
  // One string for both the tooltip and the screen-reader copy, so the quiet
  // shape never means the identifiers go missing for anybody.
  const detail =
    `Plica's stylesheet is stale — run \`pnpm build\` in the Plica checkout. ` +
    `Plica filters its own utilities against Paperclip's compiled stylesheet at build time, and ` +
    `Paperclip's has changed since. Until Plica is rebuilt, its leftover duplicates can override ` +
    `Paperclip's responsive rules and strand the whole app in its mobile layout. ` +
    `Built against ${check.recorded.file} (${check.recorded.hash}) — now serving ${check.observed}.`;
  return (
    <span
      role="alert"
      title={detail}
      className="inline-flex items-center gap-1 rounded-full border border-plica-wait/40 bg-plica-wait/10 px-2 py-0.5 text-[length:var(--plica-fs-micro,11px)] leading-[1.45] font-semibold uppercase tracking-(--tracking-label) text-plica-wait"
    >
      <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
      Stylesheet stale
      <span className="sr-only">{detail}</span>
    </span>
  );
}
