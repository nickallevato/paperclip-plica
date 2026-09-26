// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { PlicaRecentTask, PlicaRecentTasks as PlicaRecentTasksModel } from "../lib/queue";
import { PlicaRecentTasks } from "./PlicaRecentTasks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.UTC(2026, 7, 21, 12);
const at = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

const company = { id: "c1", name: "Acme", issuePrefix: "ACM", logoUrl: null } as never;
const run = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "r1",
    status: "running",
    createdAt: at(10),
    startedAt: at(9),
    agentName: "Quill",
    issueId: "i-1",
    currentStatusMessage: "Drafting section 2",
    nextAction: null,
    triggerDetail: null,
    invocationSource: "schedule",
    ...overrides,
  }) as never;
const issue = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "i-1",
    identifier: "ACM-7",
    title: "Write the quarterly report",
    status: "in_progress",
    updatedAt: at(9),
    ...overrides,
  }) as never;

const tasks = (items: PlicaRecentTask[], counts: Partial<PlicaRecentTasksModel> = {}): PlicaRecentTasksModel => ({
  items,
  working: items.filter((item) => item.phase === "working").length,
  queued: items.filter((item) => item.phase === "queued").length,
  hidden: 0,
  ...counts,
});

describe("PlicaRecentTasks", () => {
  let container: HTMLDivElement;
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function render(model: PlicaRecentTasksModel) {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <PlicaRecentTasks tasks={model} nowMs={NOW} />
        </MemoryRouter>,
      );
    });
    return root;
  }

  it("puts the ticket, its title and the elapsed time on one row, with the narration behind a hover", () => {
    const root = render(
      tasks([{ key: "c1:i-1", company, issue: issue(), run: run(), phase: "working", atMs: NOW - 9 * 60_000 }]),
    );
    const row = container.querySelector("li") as HTMLElement;
    expect(row.textContent).toContain("ACM-7");
    // The whole point of the rail column: the title fits on the row now.
    expect(row.textContent).toContain("Write the quarterly report");
    expect(row.textContent).toContain("9m");
    // The narration is the hover's job — a second line here would make the
    // pane's height track what the agent happens to be saying.
    expect(row.textContent).not.toContain("Drafting section 2");
    expect(row.querySelector("a")?.getAttribute("href")).toBe("/ACM/issues/ACM-7");
    expect(row.querySelector("[data-slot='hover-card-trigger']")).not.toBeNull();
    act(() => root.unmount());
  });

  it("marks live rows with the live icons and idle ones with the task's own status glyph", () => {
    const root = render(
      tasks([
        { key: "c1:i-1", company, issue: issue(), run: run(), phase: "working", atMs: NOW - 9 * 60_000 },
        {
          key: "c1:i-2",
          company,
          issue: issue({ id: "i-2", identifier: "ACM-8", status: "in_review" }),
          run: run({ id: "r2", status: "queued", startedAt: null, issueId: "i-2" }),
          phase: "queued",
          atMs: NOW - 60_000,
        },
        {
          key: "c1:i-3",
          company,
          issue: issue({ id: "i-3", identifier: "ACM-9", status: "done" }),
          run: undefined,
          phase: null,
          atMs: NOW - 4 * 60_000,
        },
      ]),
    );
    const rows = Array.from(container.querySelectorAll("li")) as HTMLElement[];
    expect(rows.map((row) => row.getAttribute("data-recent-task"))).toEqual(["working", "queued", "idle"]);
    expect(rows[0].querySelector("[data-live-dot]")).not.toBeNull();
    expect(rows[1].querySelector("[data-queued-dot]")).not.toBeNull();
    expect(rows[1].querySelector("[data-live-dot]")).toBeNull();
    // Nothing is running on the third, so it shows what state it is in instead.
    expect(rows[2].querySelector("[data-live-dot]")).toBeNull();
    expect(rows[2].querySelector("svg")).not.toBeNull();
    expect(rows[2].textContent).toContain("4m");
    expect(container.querySelector("h3")?.textContent).toContain("1 working");
    expect(container.querySelector("h3")?.textContent).toContain("1 queued");
    act(() => root.unmount());
  });

  it("scrolls inside a capped height rather than growing with the fleet", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      key: `c1:i-${index}`,
      company,
      issue: issue({ id: `i-${index}`, identifier: `ACM-${index}` }),
      run: run({ id: `r${index}`, issueId: `i-${index}` }),
      phase: "working" as const,
      atMs: NOW - index * 60_000,
    }));
    const root = render(tasks(items, { hidden: 5 }));
    expect(container.querySelectorAll("li")).toHaveLength(12);
    const list = container.querySelector("ul")?.className ?? "";
    expect(list).toContain("overflow-y-auto");
    expect(list).toContain("max-h-64");
    expect(container.textContent).toContain("5 more touched today");
    act(() => root.unmount());
  });

  it("says so when nothing is running and nothing has moved", () => {
    const root = render(tasks([]));
    expect(container.textContent).toContain("nothing running");
    expect(container.textContent).toContain("nothing has moved today");
    expect(container.querySelector("li")).toBeNull();
    act(() => root.unmount());
  });
});
