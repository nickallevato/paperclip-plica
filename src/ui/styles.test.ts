import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./plica.generated.css", () => ({
  default: ".plica-probe{color:red} .hidden{display:none} .flex, .plica-only{display:flex}",
}));

const { ensurePlicaStyles } = await import("./styles");

function plicaSelectors(): string[] {
  const tag = document.getElementById("plica-plugin-styles") as HTMLStyleElement;
  return Array.from(tag.sheet!.cssRules).map((r) => (r as CSSStyleRule).selectorText);
}

describe("ensurePlicaStyles", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("stays idempotent across repeat loads", () => {
    ensurePlicaStyles();
    ensurePlicaStyles();
    expect(document.querySelectorAll("#plica-plugin-styles")).toHaveLength(1);
    expect(plicaSelectors()).toEqual([".plica-probe", ".hidden", ".flex, .plica-only"]);
  });

  it("drops the class rules the host document already defines", () => {
    const host = document.createElement("style");
    host.textContent = ".hidden{display:none} @media (min-width: 40rem){.flex{display:flex}}";
    document.head.appendChild(host);
    ensurePlicaStyles();
    expect(plicaSelectors()).toEqual([".plica-probe", ".plica-only"]);
  });
});
