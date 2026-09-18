import type { SVGProps } from "react";

/**
 * Plica's own mark: a sheet folded down its middle, seen end-on.
 *
 * A *plica* is a fold, so the product's brand mark is one — two faces meeting
 * at a centre crease, one held back so the crease is visible. Read flat it is
 * a caret, which is the other thing it needs to be: small, directional, and
 * legible beside a label in the host's chrome.
 *
 * Drawn rather than imported so it inherits `currentColor` and sizes off the
 * same `h-*`/`w-*` utilities as the Lucide icons it sits among — the two-tone
 * fold is one colour at two opacities, not two colours, so the mark tracks
 * whatever the surrounding text is doing in light mode, dark mode, and on a
 * hover state that changes the text colour under it.
 *
 * The geometry is traced from the source artwork (PLI-24, `docs/brand/`) on a
 * 24×24 Lucide-compatible box: crease at x=12, outer edges at x=6 and x=18,
 * each face a parallelogram whose vertical edges are 7.25 long and whose
 * diagonals drop 3.75.
 *
 * `width`/`height` are set like Lucide's so an unsized instance renders at
 * 24px rather than filling its parent; both are presentation attributes, so a
 * Tailwind size class still wins.
 */
export function PlicaMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      aria-hidden="true"
      // A stable hook so a surface's own test can assert "the brand mark is
      // here" without restating the path data, and so it is identifiable in
      // the DOM inspector among the Lucide icons beside it.
      data-plica-mark=""
      className={className}
      {...props}
    >
      {/* Left face, at full weight. */}
      <path d="M6 6.75 12 10.5v7.25L6 14Z" fill="currentColor" />
      {/* Right face. Same colour held back to 0.42, matching the source
          artwork — one token, so the crease reads in any theme without a
          second colour to keep in sync. */}
      <path d="M18 6.75 12 10.5v7.25L18 14Z" fill="currentColor" fillOpacity={0.42} />
    </svg>
  );
}
