import { describe, expect, it } from "vitest";
import { collectSelectors, splitSelectorList, subtractSelectors, type RuleLike } from "./host-subtract";

/** A mutable CSSOM stand-in: grouping rules and style rules both hold children. */
function rules(...items: RuleLike[]) {
  const list: RuleLike[] = items;
  return { cssRules: list, deleteRule: (i: number) => void list.splice(i, 1) };
}
const style = (selectorText: string, ...children: RuleLike[]): RuleLike =>
  children.length ? { selectorText, ...rules(...children) } : { selectorText };
const group = (...children: RuleLike[]): RuleLike => rules(...children);

function selectors(list: ArrayLike<RuleLike>): unknown[] {
  return Array.from(list).map((r) =>
    r.cssRules ? { sel: r.selectorText ?? "@group", children: selectors(r.cssRules) } : r.selectorText,
  );
}

describe("splitSelectorList", () => {
  it("splits only on top-level commas", () => {
    expect(splitSelectorList(".a, .b")).toEqual([".a", ".b"]);
    expect(splitSelectorList(":is(.a, .b) > .c, .d")).toEqual([":is(.a, .b) > .c", ".d"]);
    expect(splitSelectorList('[data-x="a,b"], .e')).toEqual(['[data-x="a,b"]', ".e"]);
    expect(splitSelectorList(".w-\\,x, .y")).toEqual([".w-\\,x", ".y"]);
  });
});

describe("collectSelectors", () => {
  it("walks grouped and nested rules and skips unreadable sheets", () => {
    const crossOrigin = {
      get cssRules(): ArrayLike<RuleLike> {
        throw new DOMException("cross-origin", "SecurityError");
      },
    };
    const found = collectSelectors([
      rules(style(".a, .b"), group(style(".sm\\:flex", style("&:hover")))),
      crossOrigin,
    ]);
    expect([...found].sort()).toEqual(["&:hover", ".a", ".b", ".sm\\:flex"]);
  });
});

describe("subtractSelectors", () => {
  it("drops host-defined classes, trims lists, and sweeps emptied groups", () => {
    const sheet = rules(
      group(),
      group(style(".hidden"), style(".plica-only")),
      group(group(style(".flex"))),
      style(".a, .plica-b"),
      style(":root"),
      style(".keeps-children", group(style(".hidden"))),
    );
    const dropped = subtractSelectors(sheet, new Set([".hidden", ".flex", ".a", ":root"]));
    expect(dropped).toBe(4);
    expect(selectors(sheet.cssRules)).toEqual([
      { sel: "@group", children: [".plica-only"] },
      ".plica-b",
      ":root",
      { sel: ".keeps-children", children: [] },
    ]);
  });
});
