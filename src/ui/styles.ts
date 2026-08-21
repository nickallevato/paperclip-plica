import css from "./plica.generated.css";

const STYLE_ID = "plica-plugin-styles";

/**
 * Injects Plica's compiled utilities once per document. Idempotent across
 * hot-reloads: a second bundle load replaces the tag's text rather than
 * stacking a second copy.
 */
export function ensurePlicaStyles(): void {
  if (typeof document === "undefined") return;
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_ID;
    document.head.appendChild(tag);
  }
  if (tag.textContent !== css) tag.textContent = css;
}
