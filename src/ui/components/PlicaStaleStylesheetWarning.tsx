import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { checkHostStylesheet, type HostStylesheetCheck } from "../lib/host-stylesheet";

/**
 * Says out loud that Plica's stylesheet was built against a different Paperclip
 * than the one running, and names the fix.
 *
 * A banner rather than a badge because the thing it warns about is invisible
 * everywhere else: the symptom is Paperclip's own chrome stranded in its mobile
 * layout, with nothing on screen implicating a plugin installed weeks ago. The
 * reader has to be told what to run, in full, without hovering anything.
 *
 * Renders nothing unless the answer is a definite mismatch — see
 * `lib/host-stylesheet` on why every uncertain path is silent.
 */
export function PlicaStaleStylesheetWarning({ check: injected }: {
  /** Injectable for tests and for a reviewer wanting to see the banner. */
  check?: HostStylesheetCheck;
} = {}) {
  // Once, at mount. The answer cannot change without a page load: it compares a
  // constant baked into this bundle against the document's <link> tags.
  const [resolved] = useState<HostStylesheetCheck>(() =>
    checkHostStylesheet(typeof document === "undefined" ? undefined : document),
  );
  const check = injected ?? resolved;
  if (check.status !== "mismatch" || !check.recorded || !check.observed) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[length:var(--plica-fs-body,14px)] leading-[1.45] text-amber-700 dark:text-amber-400"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">Plica's stylesheet is stale — run `pnpm build` in the Plica checkout.</p>
        <p>
          Plica filters its own utilities against Paperclip's compiled stylesheet at build time, and Paperclip's has
          changed since. Until Plica is rebuilt, its leftover duplicates can override Paperclip's responsive rules and
          strand the whole app in its mobile layout.
        </p>
        <p className="text-[length:var(--plica-fs-micro,11px)] leading-[1.45] opacity-80">
          built against <code>{check.recorded.file}</code> ({check.recorded.hash}) — now serving{" "}
          <code>{check.observed}</code>
        </p>
      </div>
    </div>
  );
}
