/**
 * Detects that Plica was built against a different host stylesheet than the one
 * the document is actually serving.
 *
 * Why this exists: `scripts/build-css.mjs` subtracts every selector the host's
 * compiled sheet already ships, and that subtraction is computed ONCE, at build
 * time. Upgrade Paperclip and its sheet is rebuilt under a new hash; the
 * subtraction is stale, classes the new host defines stop being filtered out,
 * and a duplicate `.hidden{display:none}` landing after the host's
 * `@media(min-width:40rem){.sm\:flex{...}}` pins the whole application in its
 * mobile layout. The symptom shows up in Paperclip's own chrome with nothing on
 * screen implicating Plica. See the README's "The stylesheet coupling".
 *
 * This is a detector, not a fix. The fix is `pnpm build` in the Plica checkout.
 *
 * ## It fails open, deliberately
 *
 * Every path that cannot answer the question returns `"unknown"` and renders
 * nothing. A false "your plugin is stale" on every page load is worse than the
 * silence it replaces: it trains the reader to ignore the one badge that is
 * supposed to mean something.
 *
 * ## Plugin surface only
 *
 * The host serves its sheet as a plain `<link rel="stylesheet">` in the same
 * document Plica mounts into, so resolving it needs nothing but the DOM. No
 * host internals, no import of anything core does not export, no fetch.
 */

/** What `scripts/build-css.mjs` recorded about the sheet it subtracted. */
export interface HostCssRecord {
  /** Basename of the host sheet, e.g. `index-BU41-p9M.css`. */
  file: string;
  /** `sha256-<16 hex>` of its bytes. Displayed, not compared — see below. */
  hash: string;
}

export type HostStylesheetStatus = "match" | "mismatch" | "unknown";

export interface HostStylesheetCheck {
  status: HostStylesheetStatus;
  /** The build-time record, when there is one. */
  recorded: HostCssRecord | null;
  /** The filename resolved from the document, when one could be resolved. */
  observed: string | null;
}

/**
 * Injected by esbuild (`define`) from `src/ui/host-css.generated.json`.
 *
 * Declared rather than imported so `tsc --noEmit` passes on a fresh checkout,
 * where the generated file does not exist yet — the same reason `plica.css` is
 * reached through a wildcard module declaration.
 */
declare const __PLICA_HOST_CSS_BUILD__: HostCssRecord | null;

/**
 * The build-time record, or null when the bundle was built without one.
 *
 * The `typeof` guard is load-bearing in two directions: esbuild replaces the
 * identifier with a literal, so the guard folds away in the bundle; under
 * vitest, where nothing defines it, referencing it bare would throw a
 * `ReferenceError` instead of reading the global a test set.
 */
export function recordedHostCss(): HostCssRecord | null {
  if (typeof __PLICA_HOST_CSS_BUILD__ === "undefined") return null;
  const record = __PLICA_HOST_CSS_BUILD__;
  if (!record || typeof record.file !== "string" || !record.file) return null;
  return record;
}

/** Plica injects its own sheet as this `<style>`; never mistake it for the host's. */
const PLICA_STYLE_ID = "plica-plugin-styles";

/**
 * Vite names its entry chunk `<stem>-<hash>.css`. Splitting the stem off lets
 * a document carrying several stylesheets be narrowed to the one that is a
 * rebuild of the recorded sheet rather than a different asset entirely.
 */
function stemOf(file: string): string {
  const withoutExt = file.replace(/\.css$/i, "");
  const hashed = /^(.+)-[A-Za-z0-9_-]{6,}$/.exec(withoutExt);
  return hashed ? hashed[1] : withoutExt;
}

/**
 * Every same-origin stylesheet the document loaded, by filename, in document
 * order. Cross-origin sheets are dropped: the host serves its own assets, and a
 * CDN font sheet is not a candidate.
 */
export function documentStylesheetFiles(doc: Document): string[] {
  const base = doc.baseURI || "http://localhost/";
  const origin = new URL(base).origin;
  const links = doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]');
  const files: string[] = [];
  for (const link of Array.from(links)) {
    if (link.id === PLICA_STYLE_ID) continue;
    let url: URL;
    try {
      url = new URL(link.getAttribute("href") ?? "", base);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    const file = url.pathname.split("/").pop();
    if (file && file.toLowerCase().endsWith(".css")) files.push(file);
  }
  return files;
}

/**
 * Which of the document's stylesheets is the host's application sheet.
 *
 * One same-origin sheet: that is it, whatever it is called — a host that
 * renamed its entry chunk is still a host whose sheet Plica was not built
 * against, and saying so is the point.
 *
 * Several: narrow to the ones sharing the recorded sheet's stem. Exactly one
 * survivor is the answer; zero or many is a document this detector does not
 * understand, and it fails open rather than guess.
 */
export function resolveHostStylesheet(doc: Document, recordedFile: string): string | null {
  const files = documentStylesheetFiles(doc);
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];
  const stem = stemOf(recordedFile);
  const sameStem = files.filter((file) => stemOf(file) === stem);
  return sameStem.length === 1 ? sameStem[0] : null;
}

/**
 * Compare the sheet Plica was built against with the one the document loaded.
 *
 * The filename is the comparison key, not the content hash. The host sheet is
 * Vite-built and hash-named, so its name already changes whenever its bytes do;
 * an observed content hash would mean fetching and hashing the whole sheet on
 * every mount to learn something the name has already told us. The recorded
 * hash is carried for the warning to show and is not compared.
 *
 * The residual gap that leaves: a host serving an UNHASHED stylesheet name
 * could be rebuilt under the same name and this check would stay quiet. It
 * fails open there by construction, which is the required direction.
 */
export function checkHostStylesheet(doc: Document | undefined, recorded = recordedHostCss()): HostStylesheetCheck {
  if (!recorded || !doc) return { status: "unknown", recorded: recorded ?? null, observed: null };
  const observed = resolveHostStylesheet(doc, recorded.file);
  if (!observed) return { status: "unknown", recorded, observed: null };
  return { status: observed === recorded.file ? "match" : "mismatch", recorded, observed };
}
