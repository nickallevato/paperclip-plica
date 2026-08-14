// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLICA_TOKEN_DEFAULTS, type PlicaTokenSettings } from "../lib/plica";
import { PlicaTokenSettingsPanel } from "./PlicaTokenSettings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const companies = [
  { id: "c1", name: "Acme Robotics", issuePrefix: "ACM", brandColor: "#123456" },
  { id: "c2", name: "Beta Works", issuePrefix: "BET", brandColor: "#654321" },
] as never as Array<{ id: string; name: string; issuePrefix: string }>;

const statsById = {
  c1: { tokens: 600_000_000 },
  c2: { tokens: 100_000_000 },
} as never;

function renderPanel(container: HTMLDivElement, settings: PlicaTokenSettings, onChange = vi.fn()) {
  const root = createRoot(container);
  act(() => {
    root.render(
      <PlicaTokenSettingsPanel
        companies={companies as never}
        statsById={statsById}
        settings={settings}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );
  });
  return { root, onChange };
}

/**
 * React tracks an input's value on the node and skips its synthetic onChange
 * when a test assigns `.value` directly. Going through the native setter marks
 * the value as changed, which is what makes the event land.
 */
function setRange(el: HTMLInputElement, value: number) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(el: Element | null) {
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("PlicaTokenSettingsPanel", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("bands each company by its own effective thresholds", () => {
    renderPanel(container, { defaults: PLICA_TOKEN_DEFAULTS, overrides: {} });
    const text = container.textContent ?? "";
    // c1 at 600M is over the 500M default crit; c2 at 100M is under warn
    expect(text).toContain("ACM 600M");
    expect(text).toContain("BET 100M");
  });

  it("edits the default when no company scope is selected", () => {
    const onChange = vi.fn();
    renderPanel(container, { defaults: PLICA_TOKEN_DEFAULTS, overrides: {} }, onChange);
    setRange(container.querySelector("#plica-warn") as HTMLInputElement, 100_000_000);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaults: expect.objectContaining({ warn: 100_000_000 }) }),
    );
  });

  it("creates an override seeded from the default, then removes the row when switched off", () => {
    const onChange = vi.fn();
    const settings: PlicaTokenSettings = { defaults: { warn: 1, crit: 2 }, overrides: {} };
    renderPanel(container, settings, onChange);

    click(container.querySelector('button[title="Acme Robotics"]'));
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    act(() => {
      checkbox.click();
    });
    expect(onChange).toHaveBeenCalledWith({ defaults: { warn: 1, crit: 2 }, overrides: { c1: { warn: 1, crit: 2 } } });

    // With the override present, unchecking must DELETE the row rather than
    // store a copy of the default — otherwise the company silently stops
    // tracking later changes to the default.
    onChange.mockClear();
    renderPanel(container, { defaults: { warn: 1, crit: 2 }, overrides: { c1: { warn: 9, crit: 10 } } }, onChange);
    click(container.querySelector('button[title="Acme Robotics"]'));
    const checked = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checked.checked).toBe(true);
    act(() => {
      checked.click();
    });
    expect(onChange).toHaveBeenCalledWith({ defaults: { warn: 1, crit: 2 }, overrides: {} });
  });

  it("disables the sliders while a company is inheriting", () => {
    renderPanel(container, { defaults: PLICA_TOKEN_DEFAULTS, overrides: {} });
    click(container.querySelector('button[title="Beta Works"]'));
    expect((container.querySelector("#plica-warn") as HTMLInputElement).disabled).toBe(true);
    expect(container.textContent).toContain("Inheriting the default");
  });

  it("resets defaults and every override at once", () => {
    const onChange = vi.fn();
    renderPanel(container, { defaults: { warn: 5, crit: 6 }, overrides: { c1: { warn: 7, crit: 8 } } }, onChange);
    click(
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Reset all") ?? null,
    );
    expect(onChange).toHaveBeenCalledWith({ defaults: PLICA_TOKEN_DEFAULTS, overrides: {} });
  });
});
