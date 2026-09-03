import { describe, expect, it } from "vitest";
import { companyAccentColor } from "./CompanyPatternIcon";

describe("companyAccentColor", () => {
  it("derives a stable name-seeded hue", () => {
    const a = companyAccentColor("Globex");
    expect(a).toMatch(/^hsl\(\d+ (5[4-9]|6[0-7])% (3[6-9]|4[0-7])%\)$/);
    expect(companyAccentColor("Globex")).toBe(a);
    expect(companyAccentColor("Initech")).not.toBe(a);
  });
  it("ignores case and surrounding whitespace, so one company keeps one colour", () => {
    expect(companyAccentColor("  globex ")).toBe(companyAccentColor("Globex"));
  });
});
