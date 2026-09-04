import { describe, expect, it } from "vitest";
import { resolveTimeToken, resolveTimeTokens } from "./demo-time";

const NOW = Date.parse("2026-09-04T12:00:00.000Z");

describe("resolveTimeToken", () => {
  it("reads a bare number as minutes", () => {
    expect(resolveTimeToken("@t:-30", NOW)).toBe("2026-09-04T11:30:00.000Z");
  });

  it("handles every unit", () => {
    expect(resolveTimeToken("@t:-90s", NOW)).toBe("2026-09-04T11:58:30.000Z");
    expect(resolveTimeToken("@t:+2h", NOW)).toBe("2026-09-04T14:00:00.000Z");
    expect(resolveTimeToken("@t:-2d", NOW)).toBe("2026-09-02T12:00:00.000Z");
  });

  it("emits a bare date for @d tokens", () => {
    expect(resolveTimeToken("@d:-6", NOW)).toBe("2026-08-29");
    expect(resolveTimeToken("@d:0", NOW)).toBe("2026-09-04");
  });

  it("leaves ordinary strings alone", () => {
    expect(resolveTimeToken("in_progress", NOW)).toBeNull();
    expect(resolveTimeToken("@notatoken", NOW)).toBeNull();
  });
});

describe("resolveTimeTokens", () => {
  it("rewrites tokens anywhere in the graph", () => {
    const out = resolveTimeTokens(
      { a: "@t:0", b: [{ c: "@d:-1" }], d: "left alone", e: 7, f: null },
      NOW,
    );
    expect(out).toEqual({
      a: "2026-09-04T12:00:00.000Z",
      b: [{ c: "2026-09-03" }],
      d: "left alone",
      e: 7,
      f: null,
    });
  });

  it("copies rather than mutating, so demo writes cannot leak between loads", () => {
    const source = { nested: { at: "@t:0" } };
    const out = resolveTimeTokens(source, NOW);
    expect(out.nested).not.toBe(source.nested);
    expect(source.nested.at).toBe("@t:0");
  });
});
