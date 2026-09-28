import { describe, expect, it } from "vitest";
import { findScrollport, railMaxHeight, type NodeLike } from "./scrollport";

interface FakeNode extends NodeLike {
  name: string;
  overflowY: string;
  parentElement: FakeNode | null;
  clientHeight: number;
}

/** Builds a chain root → … → leaf and returns it leaf-first. */
function chain(...specs: Array<[string, string, number]>): FakeNode[] {
  let parent: FakeNode | null = null;
  const nodes = specs.map(([name, overflowY, clientHeight]) => {
    const node: FakeNode = { name, overflowY, clientHeight, parentElement: parent };
    parent = node;
    return node;
  });
  return nodes.reverse();
}

const overflowY = (node: FakeNode) => node.overflowY;

describe("findScrollport", () => {
  it("finds the nearest scrolling ancestor, not the outermost", () => {
    const [leaf] = chain(
      ["html", "visible", 900],
      ["outer", "auto", 800],
      ["main", "auto", 700],
      ["rail", "visible", 2000],
    );
    expect(findScrollport(leaf, overflowY)?.name).toBe("main");
  });

  it("returns null when nothing between the rail and the root scrolls", () => {
    const [leaf] = chain(
      ["html", "visible", 900],
      ["main", "visible", 900],
      ["rail", "visible", 2000],
    );
    expect(findScrollport(leaf, overflowY)).toBeNull();
  });

  it("treats scroll and overlay as scrolling", () => {
    const [scroll] = chain(["main", "scroll", 700], ["rail", "visible", 0]);
    const [overlay] = chain(["main", "overlay", 700], ["rail", "visible", 0]);
    expect(findScrollport(scroll, overflowY)?.name).toBe("main");
    expect(findScrollport(overlay, overflowY)?.name).toBe("main");
  });

  it("stops at the boundary, so a kiosk rail ignores the host scroller", () => {
    const [leaf, hudRoot] = chain(
      ["main", "auto", 700],
      ["hud", "visible", 2000],
      ["rail", "visible", 2000],
    );
    expect(findScrollport(leaf, overflowY, hudRoot)).toBeNull();
    // Without the boundary the same chain resolves to the host scroller.
    expect(findScrollport(leaf, overflowY)?.name).toBe("main");
  });

  it("uses the boundary itself when it is what scrolls", () => {
    const [leaf, hudRoot] = chain(
      ["main", "auto", 700],
      ["hud", "auto", 900],
      ["rail", "visible", 2000],
    );
    expect(findScrollport(leaf, overflowY, hudRoot)?.name).toBe("hud");
  });
});

describe("railMaxHeight", () => {
  it("leaves the gutter at both ends of the scrollport", () => {
    expect(railMaxHeight(700, 32)).toBe(668);
  });

  it("declines to measure a scrollport no taller than the gutter", () => {
    // Mid-layout, or detached: better to keep the CSS fallback than pin to ~0.
    expect(railMaxHeight(0, 32)).toBeNull();
    expect(railMaxHeight(32, 32)).toBeNull();
    expect(railMaxHeight(Number.NaN, 32)).toBeNull();
  });
});
