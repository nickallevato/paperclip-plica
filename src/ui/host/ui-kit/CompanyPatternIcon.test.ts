import { describe, expect, it } from "vitest";
import { companyAccentColor } from "./CompanyPatternIcon";

describe("companyAccentColor", () => {
  it("uses the brand colour verbatim, so a grey brand is grey", () => {
    expect(companyAccentColor("Acme", "#616161")).toBe("#616161");
    expect(companyAccentColor("x", "#abc")).toBe("#aabbcc");
  });
  it("falls back to a stable name-seeded hue", () => {
    const a = companyAccentColor("Globex", null);
    expect(a).toMatch(/^hsl\(\d+ (5[4-9]|6[0-7])% (3[6-9]|4[0-7])%\)$/);
    expect(companyAccentColor("Globex", "not-a-colour")).toBe(a);
    expect(companyAccentColor("Initech", null)).not.toBe(a);
  });
});
