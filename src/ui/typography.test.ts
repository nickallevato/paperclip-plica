import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the type scale against the two faults that have actually happened
 * here, twice each.
 *
 * Plica writes every size as `text-[length:var(--plica-fs-*,<default>)]`. That
 * utility sets font-size and nothing else — unlike Tailwind's `text-sm`, it
 * carries no line-height — so a size written without a paired `leading-` lands
 * at whatever leading its container happens to impose. Correct sizes with
 * unmoored rhythm is exactly the "looks fine but feels off" failure that
 * prompted the scale in the first place.
 *
 * The second fault is drift: a raw px size sneaks in below the smallest step,
 * so the same semantic role renders at two sizes on different surfaces.
 *
 * host/ui-kit is excluded on purpose — those are vendored copies of host
 * components and should keep matching the app's chrome, not Plica's scale.
 */
const UI_DIR = join(import.meta.dirname, ".");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "host" || entry.name === "test") continue;
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue;
    out.push(path);
  }
  return out;
}

const files = sourceFiles(UI_DIR).map((path) => ({ path, source: readFileSync(path, "utf8") }));

/** Icon monograms are sized to their box, not to the text scale. */
const ICON_MONOGRAM_SIZES = new Set(["text-[7px]", "text-[8px]"]);

describe("Plica type scale", () => {
  it("finds source files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("pairs a line-height with every scale size", () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      for (const match of source.matchAll(/text-\[length:var\(--plica-fs-[a-z]+,[^)]*\)\](?! leading-)/g)) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${path.split("/").slice(-2).join("/")}:${line} — ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps text on the scale rather than reaching for raw pixel sizes", () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      for (const match of source.matchAll(/text-\[\d+px\]/g)) {
        if (ICON_MONOGRAM_SIZES.has(match[0])) continue;
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${path.split("/").slice(-2).join("/")}:${line} — ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not mix Tailwind's own steps into Plica's surface", () => {
    const offenders: string[] = [];
    for (const { path, source } of files) {
      // strip comments first: the scale is described in prose in a few places
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const match of code.matchAll(/(?<![\w-])text-(xs|sm|base|lg|xl|2xl)(?![\w-])/g)) {
        const line = code.slice(0, match.index).split("\n").length;
        offenders.push(`${path.split("/").slice(-2).join("/")}:${line} — ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
