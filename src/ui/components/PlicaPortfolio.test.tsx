// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlicaPortfolioSort, PlicaProjectEntry } from "../lib/queue";
import { PlicaPortfolio } from "./PlicaPortfolio";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.UTC(2026, 7, 21, 12);
const DAY = 86_400_000;
const company = { id: "c1", name: "Acme", issuePrefix: "ACM", logoUrl: null } as never;
const globex = { id: "c2", name: "Globex", issuePrefix: "GLX", logoUrl: null } as never;

const entry = (
  id: string,
  open: number,
  inProgress: number,
  blocked: number,
  dueDays: number | null = null,
  owner = company,
): PlicaProjectEntry => ({
  company: owner,
  project: { id, name: id, urlKey: id } as never,
  open,
  inProgress,
  blocked,
  dueMs: dueDays === null ? null : NOW + dueDays * DAY,
  overdue: dueDays !== null && dueDays < 0,
});

function render(
  items: PlicaProjectEntry[],
  options: { sort?: PlicaPortfolioSort; companies?: never[]; onSort?: () => void } = {},
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <MemoryRouter>
        <PlicaPortfolio items={items} nowMs={NOW} {...options} />
      </MemoryRouter>,
    );
  });
  return container;
}

/** The three segment widths of one project's bar, as written into the style. */
function bar(container: HTMLElement, projectId: string): string[] {
  const row = container.querySelector(`[data-portfolio-project="${projectId}"]`) as HTMLElement;
  return [...row.querySelectorAll('[role="img"] > span')].map((span) => (span as HTMLElement).style.width);
}

describe("PlicaPortfolio", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("scales every bar to the largest project, so lengths compare across the column", () => {
    // 20 open is the scale, so a 10-open project fills exactly half its track —
    // the point of the chart is that two bars can be compared to each other,
    // not just read within themselves.
    const container = render([entry("big", 20, 20, 0), entry("half", 10, 0, 10)]);
    expect(bar(container, "big")).toEqual(["100%", "0%", "0%"]);
    expect(bar(container, "half")).toEqual(["0%", "0%", "50%"]);
  });

  it("draws the untouched remainder as its own waiting segment", () => {
    const container = render([entry("p", 10, 3, 2)]);
    expect(bar(container, "p")).toEqual(["30%", "50%", "20%"]);
  });

  it("orders worst first and says how late the late ones are", () => {
    const container = render([entry("healthy", 9, 9, 0), entry("late", 4, 1, 0, -3)]);
    const rows = [...container.querySelectorAll("[data-portfolio-project]")];
    expect(rows.map((row) => row.getAttribute("data-portfolio-project"))).toEqual(["late", "healthy"]);
    expect(rows[0].textContent).toContain("3d late");
  });

  it("totals open, blocked and late work in the header", () => {
    const container = render([entry("a", 5, 1, 2, -1), entry("b", 3, 3, 0)]);
    const header = container.querySelector("h3") as HTMLElement;
    expect(header.textContent).toContain("8 open");
    expect(header.textContent).toContain("2 blocked");
    expect(header.textContent).toContain("1 late");
  });

  it("still links each project, even though the bar is the reason to look", () => {
    const container = render([entry("alpha", 4, 1, 0)]);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/ACM/projects/alpha");
  });

  it("offers the order toggle only when there is a chart to reorder", () => {
    expect(render([entry("a", 4, 1, 0)], { onSort: vi.fn() }).querySelectorAll("[data-portfolio-sort]")).toHaveLength(2);
    // Nothing to order, so the control would be a dead affordance.
    expect(render([], { onSort: vi.fn() }).querySelector("[data-portfolio-sort]")).toBeNull();
  });

  it("reports the chosen order upward", () => {
    const onSort = vi.fn();
    const container = render([entry("a", 4, 1, 0)], { onSort });
    act(() => {
      (container.querySelector('[data-portfolio-sort="company"]') as HTMLElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(onSort).toHaveBeenCalledWith("company");
  });

  it("heads each company's block with its name and its own figures", () => {
    const container = render(
      [entry("a-late", 5, 0, 2, -1), entry("a-quiet", 3, 3, 0), entry("g-one", 4, 1, 0, null, globex)],
      { sort: "company", companies: [company, globex] as never },
    );
    const headers = [...container.querySelectorAll("[data-portfolio-company]")];
    expect(headers.map((node) => node.getAttribute("data-portfolio-company"))).toEqual(["c1", "c2"]);
    expect(headers[0].textContent).toContain("Acme");
    // Scoped to the company, not the whole portfolio.
    expect(headers[0].textContent).toContain("8");
    expect(headers[0].textContent).toContain("2 blocked");
    expect(headers[0].textContent).toContain("1 late");
    expect(headers[1].textContent).toContain("Globex");
    expect(headers[1].textContent).not.toContain("blocked");
  });

  it("drops the per-row company icon once a header says whose the block is", () => {
    const grouped = render([entry("a", 4, 1, 0)], { sort: "company", companies: [company] as never });
    const groupedRow = grouped.querySelector("[data-portfolio-project]") as HTMLElement;
    expect(groupedRow.querySelector('[class*="size-3.5"]')).toBeNull();
    expect(grouped.querySelectorAll("[data-portfolio-company]")).toHaveLength(1);

    // The same row in trouble order has to carry its own icon, since nothing
    // above it says whose project it is.
    const flat = render([entry("a", 4, 1, 0)]);
    expect((flat.querySelector("[data-portfolio-project]") as HTMLElement).querySelector('[class*="size-3.5"]')).not.toBeNull();
  });

  it("heads nothing in trouble order, where a run of bars has no shared owner", () => {
    const container = render([entry("a", 5, 0, 2), entry("g", 4, 1, 0, null, globex)]);
    expect(container.querySelector("[data-portfolio-company]")).toBeNull();
  });

  it("says so plainly when nothing is in flight", () => {
    const container = render([]);
    expect(container.textContent).toContain("no open project work");
    expect(container.querySelector('[role="img"]')).toBeNull();
  });
});
