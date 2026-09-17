# Brand

`plica-mark-256.png` is the source artwork for Plica's mark, as supplied on
PLI-24: a sheet folded down its middle seen end-on — a *plica* — which reads
flat as a caret.

It is here for provenance, not for use. Nothing in the plugin loads it. Every
surface that shows the mark renders
[`src/ui/components/PlicaMark.tsx`](../../src/ui/components/PlicaMark.tsx),
an SVG traced from this file, because a component inherits `currentColor` and
so survives light mode, dark mode, and a hover state that recolours the text
beside it — a PNG in one fixed cream does none of that.

## The geometry, if the SVG ever has to be redrawn

On a 24×24 Lucide-compatible box, scaled from the 256×256 original:

| | |
| --- | --- |
| Crease | `x = 12` |
| Outer edges | `x = 6` and `x = 18` |
| Top vertices | `y = 6.75` outer, `y = 10.5` at the crease |
| Vertical edge | `7.25` long — so `y = 14` outer, `y = 17.75` at the crease |
| Diagonal drop | `3.75` |

Each face is a parallelogram: two vertical edges joined by two parallel
diagonals. Both faces are `currentColor`; the right one is held at `0.42`
opacity, which is the original's 107/255 alpha.
