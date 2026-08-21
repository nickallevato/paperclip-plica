// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PlicaLiveList } from "./PlicaLiveList";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const company = { id: "c1", name: "Acme", issuePrefix: "ACM" } as never;
const run = (overrides: Record<string, unknown>) =>
  ({
    id: "r1",
    status: "running",
    createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    startedAt: new Date(Date.now() - 9 * 60_000).toISOString(),
    agentName: "Quill",
    issueId: "i-1",
    currentStatusMessage: "Drafting section 2",
    nextAction: null,
    triggerDetail: null,
    invocationSource: "schedule",
    ...overrides,
  }) as never;
const issue = { id: "i-1", identifier: "ACM-7", title: "Write the quarterly report", status: "in_progress" } as never;

describe("PlicaLiveList", () => {
  let container: HTMLDivElement;
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the ticket being worked on, not the narration, on the row", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <PlicaLiveList entries={[{ company, run: run({}), issue, startedMs: 0 }]} />
        </MemoryRouter>,
      );
    });
    const row = container.querySelector("li") as HTMLElement;
    expect(row.textContent).toContain("Quill");
    expect(row.textContent).toContain("ACM-7");
    expect(row.textContent).toContain("Write the quarterly report");
    expect(row.textContent).not.toContain("Drafting section 2");
    expect(row.querySelector("a")?.getAttribute("href")).toBe("/ACM/issues/ACM-7");
    expect(row.querySelector("[data-slot='hover-card-trigger']")).not.toBeNull();
    act(() => root.unmount());
  });

  it("falls back to the narration when the run has no ticket", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <PlicaLiveList entries={[{ company, run: run({ issueId: null }), issue: undefined, startedMs: 0 }]} />
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toContain("Drafting section 2");
    expect(container.querySelector("[data-slot='hover-card-trigger']")).toBeNull();
    act(() => root.unmount());
  });
});
