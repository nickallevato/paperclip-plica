import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./plica.generated.css", () => ({ default: ".plica-probe{color:red}" }));

const { ensurePlicaStyles } = await import("./styles");

describe("ensurePlicaStyles", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("stays idempotent across repeat loads", () => {
    ensurePlicaStyles();
    ensurePlicaStyles();
    expect(document.querySelectorAll("#plica-plugin-styles")).toHaveLength(1);
    expect(document.getElementById("plica-plugin-styles")?.textContent).toBe(".plica-probe{color:red}");
  });
});
