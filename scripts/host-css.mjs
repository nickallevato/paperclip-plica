/**
 * Decides WHICH host stylesheet `build-css.mjs` subtracts and stamps.
 *
 * Split out of build-css.mjs because getting this wrong is invisible. The build
 * succeeds, `plica.generated.css` looks fine, and the only symptom is that the
 * "Stylesheet stale" badge never clears — the reader rebuilds, sees the same
 * badge, and concludes the detector is broken rather than that the build read
 * the wrong file. So the choice is made by a pure function with tests, and the
 * script reports what it chose and what it passed over.
 *
 * The authority is the host's own `index.html`. Vite writes the `<link
 * rel="stylesheet">` that names the entry sheet it just emitted, and that is the
 * same tag `src/ui/lib/host-stylesheet` reads at mount — so resolving from it
 * makes both halves of the comparison agree by construction. Guessing from the
 * directory listing only happens when there is no `index.html` to ask.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

/** Where a default Paperclip checkout leaves its built UI. */
export const DEFAULT_HOST_DIST = join(homedir(), "paperclip", "ui", "dist");

/**
 * Basenames of the stylesheets an HTML document links, in document order.
 *
 * Parsed with a regex rather than a DOM: this runs in the build, before
 * anything jsdom-shaped is available, and the input is machine-written markup
 * from Vite rather than arbitrary hand-authored HTML.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function linkedStylesheets(html) {
  const files = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    // `rel~="stylesheet"`, matching the runtime selector: `rel="stylesheet"` and
    // `rel="preload stylesheet"` are both the host telling us this is a sheet.
    if (!/\brel\s*=\s*("[^"]*\bstylesheet\b|'[^']*\bstylesheet\b|stylesheet)/i.test(tag)) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!value) continue;
    const file = basename(value.split("?")[0].split("#")[0]);
    if (file.toLowerCase().endsWith(".css")) files.push(file);
  }
  return files;
}

/**
 * @typedef {{ name: string, size: number, mtimeMs: number }} CssFile
 *
 * @typedef {object} HostCssChoice
 * @property {string | null} name   Basename chosen, or null when there is nothing to choose.
 * @property {"index.html" | "newest" | "only" | "none"} basis How it was chosen.
 * @property {string[]} passedOver  Other candidates, for the build to report.
 * @property {string[]} warnings    Things the reader needs to know, verbatim.
 */

/**
 * Pick the host's application stylesheet out of its built assets.
 *
 * `linked` is what the host's `index.html` says; `files` is what is on disk.
 * Disk is the reality check — a sheet named by a stale `index.html` but absent
 * from `assets/` cannot be subtracted — but `index.html` is the authority on
 * which of several present sheets is the live one.
 *
 * When there is no `index.html` to ask, the fallback is the NEWEST file, not the
 * largest. Both are guesses, but they fail differently: an abandoned sheet from
 * an earlier build that happens to be bigger than the current one is a normal
 * thing to find in an unclean `dist/`, and "largest" picks it every time,
 * silently and repeatably. "Newest" is wrong only when a build somehow produced
 * an older mtime than the file it replaced. Either way the ambiguity is
 * reported rather than swallowed.
 *
 * @param {{ linked?: string[], files: CssFile[] }} input
 * @returns {HostCssChoice}
 */
export function chooseHostCss({ linked = [], files }) {
  if (files.length === 0) {
    return { name: null, basis: "none", passedOver: [], warnings: [] };
  }

  const onDisk = new Map(files.map((f) => [f.name, f]));
  const named = linked.filter((file) => onDisk.has(file));
  const warnings = [];

  for (const file of linked) {
    if (!onDisk.has(file)) {
      warnings.push(`index.html links ${file}, which is not in the assets dir — ignoring it`);
    }
  }

  if (named.length === 1) {
    return { name: named[0], basis: "index.html", passedOver: others(files, named[0]), warnings };
  }

  if (named.length > 1) {
    // A host that ships several sheets in one document: the application sheet
    // is the big one, and unlike the unclean-dist case every candidate here is
    // live, so size is a real signal rather than a coin flip.
    const biggest = [...named].sort((a, b) => onDisk.get(b).size - onDisk.get(a).size)[0];
    warnings.push(`index.html links ${named.length} stylesheets; taking the largest (${biggest})`);
    return { name: biggest, basis: "index.html", passedOver: others(files, biggest), warnings };
  }

  if (linked.length > 0) {
    warnings.push("no stylesheet named by index.html is present in the assets dir");
  }

  if (files.length === 1) {
    return { name: files[0].name, basis: "only", passedOver: [], warnings };
  }

  const newest = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  warnings.push(
    `${files.length} stylesheets in the assets dir and no index.html to disambiguate them; ` +
      `taking the most recently modified (${newest.name}). Set PLICA_HOST_CSS to be sure.`,
  );
  return { name: newest.name, basis: "newest", passedOver: others(files, newest.name), warnings };
}

/** @param {CssFile[]} files @param {string} chosen */
function others(files, chosen) {
  return files.filter((f) => f.name !== chosen).map((f) => f.name);
}

/**
 * Resolve the host stylesheet for real, off the filesystem.
 *
 * `PLICA_HOST_CSS` still wins — it is the documented escape hatch for a host
 * that does not live at the default path. What changes is that taking it is now
 * announced, and if the host's `index.html` disagrees with it we say so: an
 * override left in a shell profile pointing at last month's checkout is the
 * single most common reason a correct-looking build never clears the badge.
 *
 * @param {{ env?: Record<string, string | undefined>, dist?: string }} [options]
 * @returns {{ path: string | null, basis: string, passedOver: string[], warnings: string[] }}
 */
export function resolveHostCss({ env = process.env, dist = DEFAULT_HOST_DIST } = {}) {
  const linked = readLinkedStylesheets(dist);

  const override = env.PLICA_HOST_CSS;
  if (override) {
    const warnings = [`PLICA_HOST_CSS is set, so the scan of ${dist} was skipped`];
    if (linked.length > 0 && !linked.includes(basename(override))) {
      warnings.push(
        `PLICA_HOST_CSS points at ${basename(override)} but ${join(dist, "index.html")} ` +
          `serves ${linked.join(", ")} — if that dist is the one your server serves, the ` +
          `override is stale and the badge will not clear. Unset it or point it at the live sheet.`,
      );
    }
    return { path: override, basis: "PLICA_HOST_CSS", passedOver: [], warnings };
  }

  const assets = join(dist, "assets");
  if (!existsSync(assets)) {
    return { path: null, basis: "none", passedOver: [], warnings: [`${assets} does not exist`] };
  }

  const files = readdirSync(assets)
    .filter((f) => f.toLowerCase().endsWith(".css"))
    .map((name) => {
      const stat = statSync(join(assets, name));
      return { name, size: stat.size, mtimeMs: stat.mtimeMs };
    });

  const choice = chooseHostCss({ linked, files });
  return {
    path: choice.name ? join(assets, choice.name) : null,
    basis: choice.basis,
    passedOver: choice.passedOver,
    warnings: choice.warnings,
  };
}

/** @param {string} dist */
function readLinkedStylesheets(dist) {
  const html = join(dist, "index.html");
  if (!existsSync(html)) return [];
  try {
    return linkedStylesheets(readFileSync(html, "utf8"));
  } catch {
    // An unreadable index.html is not fatal; the directory scan still has an
    // answer, and it will say that it guessed.
    return [];
  }
}
