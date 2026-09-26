import css from "./plica.generated.css";
import { collectSelectors, subtractSelectors, type SheetLike } from "./lib/host-subtract";

const STYLE_ID = "plica-plugin-styles";

/**
 * Injects Plica's compiled utilities once per document, minus every class rule
 * the host already defines (see `lib/host-subtract` for why that subtraction is
 * load-bearing). Idempotent across hot-reloads: a second bundle load replaces
 * the tag's text rather than stacking a second copy, and an unchanged tag is
 * left alone — its rules were already subtracted.
 */
export function ensurePlicaStyles(): void {
  if (typeof document === "undefined") return;
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_ID;
    document.head.appendChild(tag);
  }
  if (tag.textContent === css) return;
  tag.textContent = css;
  const sheet = tag.sheet;
  if (!sheet) return;
  // CSSRule's DOM typing has no `selectorText`; host-subtract narrows per rule.
  const hostSheets = Array.from(document.styleSheets).filter((s) => s !== sheet) as unknown as SheetLike[];
  subtractSelectors(sheet as unknown as SheetLike, collectSelectors(hostSheets));
}
