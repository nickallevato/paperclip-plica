// Compiles src/ui/plica.css → src/ui/plica.generated.css with Tailwind v4,
// scanning Plica's own sources for class candidates. See plica.css for why.
//
// The output is then filtered against the HOST's compiled stylesheet: any
// utility Paperclip already ships is dropped from Plica's sheet.
//
// Why the filter is load-bearing: styles.ts appends Plica's <style> to <head>,
// so it lands AFTER the host stylesheet. Tailwind emits every scanned
// candidate, including bare utilities the host also defines (`.hidden`,
// `.flex`, `.block`). A duplicate `.hidden{display:none}` then outranks the
// host's `@media(min-width:40rem){.sm\:flex{display:flex}}` on document order
// -- equal specificity, same cascade layer -- silently breaking Paperclip's
// `hidden sm:flex` idiom and stranding every desktop-only element in its
// mobile layout.
//
// Ordering cannot fix this: appended last, Plica's duplicates beat the host's
// responsive variants; inserted first, Plica's @layer names are declared ahead
// of the host's, which pushes the host's `components` layer AFTER `utilities`
// and wrecks component styling app-wide. Dropping the duplicates removes the
// collision entirely and leaves only what Plica actually needs -- the
// utilities the host happens not to use.
//
// WHICH host sheet gets subtracted is decided by host-css.mjs; see its header
// for why that is a separate, tested module rather than four lines inline.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import postcss from "postcss";

import { resolveHostCss } from "./host-css.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "src/ui/plica.css");
const output = resolve(root, "src/ui/plica.generated.css");
// The record of WHICH host sheet the subtraction below was computed against.
// esbuild.config.mjs inlines it into the UI bundle; src/ui/lib/host-stylesheet
// compares it against the sheet the document actually loaded and warns when
// they differ. See the README's "The stylesheet coupling".
const stamp = resolve(root, "src/ui/host-css.generated.json");

const { path: hostCssPath, basis, passedOver, warnings } = resolveHostCss();
// Report the choice before the build runs. Which sheet was read is the one fact
// that explains a "Stylesheet stale" badge surviving a successful build, and it
// used to be buried at the end of a summary line nobody reads to the end of.
for (const warning of warnings) console.warn(`build-css: ${warning}`);
if (hostCssPath) {
  console.log(`build-css: host stylesheet ${hostCssPath} (chosen by: ${basis})`);
  if (passedOver.length) {
    console.warn(
      `build-css: passed over ${passedOver.join(", ")} in the same dir. If the page serves ` +
        `one of those, set PLICA_HOST_CSS to it or clean the assets dir.`,
    );
  }
}
if (!hostCssPath || !existsSync(hostCssPath)) {
  // Fail loudly. Emitting the unfiltered sheet would silently reintroduce the
  // cascade collision described above.
  throw new Error(
    "build-css: host stylesheet not found. Set PLICA_HOST_CSS to Paperclip's " +
      "compiled CSS (ui/dist/assets/index-*.css). Refusing to emit an " +
      "unfiltered sheet, which would break the host's `hidden sm:flex` idiom.",
  );
}

const hostCss = readFileSync(hostCssPath, "utf8");
// `file` is the runtime comparison key: the host's sheet is Vite-built and
// hash-named, so its filename already changes whenever its content does, and a
// filename is readable from a <link> tag without fetching 450KB of CSS on every
// mount. `hash` is recorded alongside it for the warning to display and for
// anyone diffing two installs by hand -- it is not compared at runtime.
const hostCssRecord = {
  file: basename(hostCssPath),
  hash: `sha256-${createHash("sha256").update(hostCss).digest("hex").slice(0, 16)}`,
};
writeFileSync(stamp, `${JSON.stringify(hostCssRecord, null, 2)}\n`);

const compiler = await compile(readFileSync(input, "utf8"), {
  base: dirname(input),
  onDependency: () => {},
});
const scanner = new Scanner({
  sources: compiler.sources.length ? compiler.sources : [{ base: dirname(input), pattern: "**/*", negated: false }],
});
const candidates = scanner.scan();
const built = compiler.build(candidates);

// Every class selector the host already defines.
const hostSelectors = new Set();
postcss.parse(hostCss).walkRules((rule) => {
  for (const sel of rule.selectors) hostSelectors.add(sel.trim());
});

let dropped = 0;
const ast = postcss.parse(built);
ast.walkRules((rule) => {
  // Only class utilities are candidates for removal. Element/:root/attribute
  // rules are left alone: those carry Plica's own scaffolding, and the host
  // defining a same-named selector does not make them redundant.
  const keep = rule.selectors.filter((sel) => {
    const s = sel.trim();
    if (!s.startsWith(".")) return true;
    if (!hostSelectors.has(s)) return true;
    dropped += 1;
    return false;
  });
  if (keep.length === 0) rule.remove();
  else if (keep.length !== rule.selectors.length) rule.selectors = keep;
});
// Sweep at-rule blocks (@media/@layer/@supports) left empty by the filter.
let swept = 1;
while (swept) {
  swept = 0;
  ast.walkAtRules((at) => {
    if (at.nodes && at.nodes.length === 0) {
      at.remove();
      swept += 1;
    }
  });
}

const css = ast.toString();
writeFileSync(output, `/* generated by scripts/build-css.mjs — do not edit */\n${css}`);
console.log(
  `plica.generated.css: ${candidates.length} candidates, ${css.length} bytes ` +
    `(${dropped} host-duplicate selectors dropped)`,
);
// Phrased as a claim about the running plugin because that is what the reader is
// comparing it against: the badge's hover text says "now serving <X>", and this
// line is the other side of that sentence.
console.log(
  `host-css.generated.json: built against ${hostCssRecord.file} (${hostCssRecord.hash}) — ` +
    `the badge clears only if the page serves that exact filename`,
);
