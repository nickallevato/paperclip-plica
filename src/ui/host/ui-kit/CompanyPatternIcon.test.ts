import { describe, expect, it } from "vitest";
import { companyAccentColor, companyHues } from "./CompanyPatternIcon";

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

  it("is the pattern's saturated base, not a washed-out blend", () => {
    // The accent must read as the icon's dominant colour. A blend toward the
    // pale dither tint would land far lighter than the base it comes from.
    for (const name of NAMES) {
      const [r, g, b] = channels(companyAccentColor(name));
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      expect(max - min).toBeGreaterThan(60);
      expect(luma(companyAccentColor(name))).toBeLessThan(150);
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

describe("companyHues", () => {
  it("spaces a roster evenly around the wheel", () => {
    const hues = [...companyHues(NAMES).values()].sort((a, b) => a - b);
    expect(hues).toHaveLength(NAMES.length);
    const step = 360 / NAMES.length;
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i]! - hues[i - 1]!).toBeCloseTo(step, 0);
    }
  });

  it("is stable for a roster and independent of the order it arrives in", () => {
    const forward = companyHues(NAMES);
    const reversed = companyHues([...NAMES].reverse());
    for (const name of NAMES) {
      expect(reversed.get(name.toLowerCase())).toBe(forward.get(name.toLowerCase()));
    }
  });

  it("pulls apart companies the name hash put on top of each other", () => {
    // Globex Analytics and Acme Robotics hash to neighbouring hues; spacing them
    // against the real roster is the point of the palette.
    const roster = [
      "Globex Analytics",
      "Father's Guide",
      "Acme Robotics",
      "Acme Robotics IT",
      "Initech Payments",
      "clover apiary",
    ];
    const hues = companyHues(roster);
    const gap = Math.abs(hues.get("bora rental")! - hues.get("lion peak house")!);
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(40);

    const spaced = roster.map((name) => channels(companyAccentColor(name, hues.get(name.trim().toLowerCase()))));
    for (let i = 0; i < spaced.length; i++) {
      for (let j = i + 1; j < spaced.length; j++) {
        const distance = Math.hypot(...[0, 1, 2].map((c) => spaced[i]![c]! - spaced[j]![c]!));
        expect(distance).toBeGreaterThan(60);
      }
    }
  });
});
