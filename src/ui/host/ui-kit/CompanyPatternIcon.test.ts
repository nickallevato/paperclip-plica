import { describe, expect, it } from "vitest";
import { companyAccentColor } from "./CompanyPatternIcon";

const RGB = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3})\)$/;

function channels(colour: string): [number, number, number] {
  const match = RGB.exec(colour);
  if (!match) throw new Error(`not an rgb() colour: ${colour}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Rec. 601 luma, the same weighting the eye applies to the dithered tile. */
function luma(colour: string): number {
  const [r, g, b] = channels(colour);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const NAMES = ["Globex", "Initech", "Acme", "Umbrella Corp", "Northwind Partners Consulting"];

describe("companyAccentColor", () => {
  it("returns a well-formed rgb() colour", () => {
    for (const name of NAMES) {
      expect(companyAccentColor(name)).toMatch(RGB);
    }
  });

  it("is stable per company and distinct between companies", () => {
    const a = companyAccentColor("Globex");
    expect(companyAccentColor("Globex")).toBe(a);
    expect(companyAccentColor("Initech")).not.toBe(a);
  });

  it("ignores case and surrounding whitespace, so one company keeps one colour", () => {
    expect(companyAccentColor("  globex ")).toBe(companyAccentColor("Globex"));
  });

  it("lands mid-tone, not on the pattern's dark base", () => {
    // The accent is the mean of the tile, so the pale dithered dots pull it
    // well clear of the base colour. Too dark means the blend was skipped.
    for (const name of NAMES) {
      const value = luma(companyAccentColor(name));
      expect(value).toBeGreaterThan(90);
      expect(value).toBeLessThan(215);
    }
  });

  it("keeps companies apart by more than a rounding step", () => {
    const seen = NAMES.map((name) => channels(companyAccentColor(name)));
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const distance = Math.max(
          ...[0, 1, 2].map((c) => Math.abs(seen[i]![c]! - seen[j]![c]!)),
        );
        expect(distance).toBeGreaterThan(8);
      }
    }
  });
});
