import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Resolved from the project root (vitest's cwd) rather than import.meta.url,
// which the test transform rewrites.
const BUNDLE = resolve(process.cwd(), "dist/ui/index.js");

/**
 * Guards the host's bare-specifier rewrite contract.
 *
 * Before importing a plugin UI bundle, the host rewrites its bare specifiers to
 * blob URLs (ui/src/plugins/slots.tsx, rewriteBareSpecifiers). That rewrite is a
 * literal string replace of ` from "react"` — WITH a leading space. A
 * whitespace-minified bundle emits `from"react"`, the rewrite misses it, the
 * browser cannot resolve the bare specifier, and the dynamic import fails.
 *
 * The failure mode is nasty: the host silently falls back to its slot
 * placeholder ("Plica: Plica") and logs nothing useful, so the page just looks
 * empty. That is exactly what happened when minify was first switched on.
 *
 * These tests run against the built artifact, so they only mean something after
 * `pnpm build`.
 */
const EXTERNALS = ["react", "react-dom", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"];

describe.skipIf(!existsSync(BUNDLE))("built UI bundle", () => {
  const source = existsSync(BUNDLE) ? readFileSync(BUNDLE, "utf8") : "";

  it("emits every bare import in the spaced form the host rewrite matches", () => {
    for (const specifier of EXTERNALS) {
      expect(
        source.includes(`from"${specifier}"`),
        `bundle contains unspaced \`from"${specifier}"\`, which the host's rewriteBareSpecifiers will not rewrite — do not enable minifyWhitespace`,
      ).toBe(false);
    }
  });

  it("keeps react and the SDK external rather than bundling a second copy", () => {
    expect(source).toContain('from "react"');
    // A bundled React would define its internals inline; the host must supply
    // the single instance so context (including react-query's) is shared.
    expect(source).not.toContain("react.development.js");
  });

  it("does not ship react-router, which is a test-only dependency", () => {
    expect(source).not.toContain("react-router");
  });
});
