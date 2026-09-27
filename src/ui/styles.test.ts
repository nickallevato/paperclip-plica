import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tickler.generated.css", () => ({
  default: ".tickler-probe{color:red} .hidden{display:none} .flex, .tickler-only{display:flex}",
}));

const { ensureTicklerStyles } = await import("./styles");

function ticklerSelectors(): string[] {
  const tag = document.getElementById("tickler-plugin-styles") as HTMLStyleElement;
  return Array.from(tag.sheet!.cssRules).map((r) => (r as CSSStyleRule).selectorText);
}

describe("ensureTicklerStyles", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("stays idempotent across repeat loads", () => {
    ensureTicklerStyles();
    ensureTicklerStyles();
    expect(document.querySelectorAll("#tickler-plugin-styles")).toHaveLength(1);
    expect(ticklerSelectors()).toEqual([".tickler-probe", ".hidden", ".flex, .tickler-only"]);
  });

  it("drops the class rules the host document already defines", () => {
    const host = document.createElement("style");
    host.textContent = ".hidden{display:none} @media (min-width: 40rem){.flex{display:flex}}";
    document.head.appendChild(host);
    ensureTicklerStyles();
    expect(ticklerSelectors()).toEqual([".tickler-probe", ".tickler-only"]);
  });
});
