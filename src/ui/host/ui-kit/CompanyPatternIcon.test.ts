import { describe, expect, it } from "vitest";
import { companyAccentColor } from "./CompanyPatternIcon";

describe("companyAccentColor", () => {
  it("uses the brand colour verbatim, so a grey brand is grey", () => {
    expect(companyAccentColor("Acme Robotics", "#616161")).toBe("#616161");
    expect(companyAccentColor("x", "#abc")).toBe("#aabbcc");
  });
  it("falls back to a stable name-seeded hue", () => {
    const a = companyAccentColor("Globex Analytics", null);
    expect(a).toMatch(/^hsl\(\d+ 60% 50%\)$/);
    expect(companyAccentColor("Globex Analytics", "not-a-colour")).toBe(a);
    expect(companyAccentColor("Initech Payments", null)).not.toBe(a);
  });
});
