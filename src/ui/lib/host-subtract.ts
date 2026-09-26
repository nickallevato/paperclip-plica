/**
 * Removes from Plica's injected stylesheet every class rule the host document
 * already defines.
 *
 * Why: Tailwind emits every class Plica's sources mention, including ones
 * Paperclip also ships. Plica's `<style>` is appended after the host's sheet, so
 * a duplicate wins on document order — a stray `.hidden{display:none}` beats the
 * host's `@media(min-width:40rem){.sm\:flex{...}}` and pins the whole app in its
 * mobile layout. Inserting first does not help either: Plica's `@layer`
 * declarations would then reorder the host's layers. Subtraction is the only
 * approach that works (README, "Why Plica subtracts the host's selectors").
 *
 * This used to happen at build time, against whichever host sheet was on the
 * builder's disk — which went stale on every Paperclip upgrade and made a
 * published build wrong for everyone else's Paperclip. Doing it against the
 * sheets the document actually loaded means there is nothing to go stale.
 *
 * The browser serialises `selectorText` on both sides, so the comparison is
 * between two normalised strings rather than two authors' spellings.
 *
 * Plugin surface only: nothing but the CSSOM of the document Plica mounts into.
 */

/** The slice of the CSSOM this module touches, so tests can hand it fakes. */
export interface RuleLike {
  selectorText?: string;
  cssRules?: ArrayLike<RuleLike>;
  deleteRule?: (index: number) => void;
}

export interface SheetLike {
  readonly cssRules: ArrayLike<RuleLike>;
  deleteRule(index: number): void;
}

/**
 * Splits a selector list on its top-level commas — not the ones inside
 * `:is(a, b)`, `[attr="a,b"]` or an escaped `\,`.
 */
export function splitSelectorList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

function readRules(owner: { cssRules?: ArrayLike<RuleLike> | null }): ArrayLike<RuleLike> | null {
  try {
    return owner.cssRules ?? null;
  } catch {
    // A cross-origin sheet (a web font's CSS, say) throws on access. It cannot
    // hold host utilities, so skipping it loses nothing.
    return null;
  }
}

/** Every selector defined anywhere in `sheets`, nested and grouped rules included. */
export function collectSelectors(sheets: Iterable<{ cssRules?: ArrayLike<RuleLike> | null }>): Set<string> {
  const found = new Set<string>();
  const walk = (rules: ArrayLike<RuleLike> | null) => {
    if (!rules) return;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (typeof rule.selectorText === "string") {
        for (const sel of splitSelectorList(rule.selectorText)) found.add(sel);
      }
      walk(readRules(rule));
    }
  };
  for (const sheet of sheets) walk(readRules(sheet));
  return found;
}

/**
 * Deletes, in place, every class selector of `sheet` that `defined` already
 * has, then any grouping rule (`@media`, `@layer`, `@supports`) left empty.
 *
 * Only selectors starting with `.` are candidates, matching what the build used
 * to do: element, `:root` and `:where(...)` rules carry Plica's own scaffolding,
 * and the host defining a same-named selector does not make them redundant.
 *
 * Returns how many selectors were dropped.
 */
export function subtractSelectors(sheet: SheetLike, defined: Set<string>): number {
  let dropped = 0;
  const prune = (owner: RuleLike | SheetLike): void => {
    const rules = readRules(owner);
    if (!rules || typeof owner.deleteRule !== "function") return;
    // Backwards, so deleting one rule does not shift the ones still to visit.
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      if (typeof rule.selectorText === "string") {
        const all = splitSelectorList(rule.selectorText);
        const keep = all.filter((sel) => !(sel.startsWith(".") && defined.has(sel)));
        dropped += all.length - keep.length;
        if (keep.length === 0) {
          owner.deleteRule(i);
          continue;
        }
        if (keep.length !== all.length) rule.selectorText = keep.join(", ");
      }
      const children = readRules(rule);
      if (!children) continue;
      prune(rule);
      // A grouping rule the filter emptied. A style rule is kept even when its
      // nested children are gone: it still carries its own declarations.
      if (children.length === 0 && typeof rule.selectorText !== "string") owner.deleteRule(i);
    }
  };
  prune(sheet);
  return dropped;
}
