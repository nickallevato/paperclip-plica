// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { DashboardRunActivityDay } from "@paperclipai/shared";
import { PlicaSparkline } from "./PlicaSparkline";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function day(date: string, succeeded: number, failed: number): DashboardRunActivityDay {
  return { date, succeeded, failed, recovered: 0, other: 0, total: succeeded + failed } as DashboardRunActivityDay;
}

describe("PlicaSparkline", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders 7 bars from a fixture summary", () => {
    const runActivity: DashboardRunActivityDay[] = [
      day("2026-07-22", 5, 0),
      day("2026-07-23", 3, 1),
      day("2026-07-24", 0, 0),
      day("2026-07-25", 8, 2),
      day("2026-07-26", 2, 0),
      day("2026-07-27", 4, 1),
      day("2026-07-28", 12, 1),
    ];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<PlicaSparkline runActivity={runActivity} />);
    });

    const days = container.querySelectorAll('[data-testid="sparkline-day"]');
    expect(days).toHaveLength(7);

    // zero-activity day renders a baseline mark rather than stacked bars
    expect(container.querySelectorAll('[data-testid="sparkline-bar-empty"]')).toHaveLength(1);
    // days with activity render both a succeeded and failed rect (failed may be 0-height but present)
    expect(container.querySelectorAll('[data-testid="sparkline-bar-succeeded"]').length).toBe(6);

    const titles = Array.from(container.querySelectorAll("title")).map((el) => el.textContent);
    expect(titles.some((title) => title?.includes("12 ok, 1 failed"))).toBe(true);

    act(() => root.unmount());
  });

  it("renders nothing when there is no run activity", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<PlicaSparkline runActivity={[]} />);
    });
    expect(container.querySelector("svg")).toBeNull();
    act(() => root.unmount());
  });
});
