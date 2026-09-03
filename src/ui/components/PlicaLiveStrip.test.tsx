// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { PlicaLiveEntry } from "../lib/queue";
import { PlicaLiveStrip } from "./PlicaLiveStrip";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const company = { id: "c1", name: "Acme", issuePrefix: "ACM", logoUrl: null } as never;
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

describe("PlicaLiveStrip", () => {
  let container: HTMLDivElement;
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function render(entries: PlicaLiveEntry[]) {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <PlicaLiveStrip entries={entries} />
        </MemoryRouter>,
      );
    });
    return root;
  }

  it("puts the ticket, the agent and the elapsed time on one pill, and the rest behind a hover", () => {
    const root = render([{ company, run: run({}), issue, startedMs: 0, phase: "working" }]);
    const pill = container.querySelector("li") as HTMLElement;
    expect(pill.textContent).toContain("ACM-7");
    expect(pill.textContent).toContain("Quill");
    // The title and the narration would both wrap a pill onto a second line
    // and change the strip's height, which is the one thing it must not do.
    expect(pill.textContent).not.toContain("Write the quarterly report");
    expect(pill.textContent).not.toContain("Drafting section 2");
    expect(pill.querySelector("a")?.getAttribute("href")).toBe("/ACM/issues/ACM-7");
    expect(pill.querySelector("[data-slot='hover-card-trigger']")).not.toBeNull();
    act(() => root.unmount());
  });

  it("marks a queued run apart from a working one, and counts each in the header", () => {
    const root = render([
      { company, run: run({}), issue, startedMs: 0, phase: "working" },
      {
        company,
        run: run({ id: "r2", status: "queued", startedAt: null, currentStatusMessage: null }),
        issue,
        startedMs: 1,
        phase: "queued",
      },
    ]);
    expect(container.querySelector("h3")?.textContent).toContain("1 working");
    expect(container.querySelector("h3")?.textContent).toContain("1 queued");
    const pills = Array.from(container.querySelectorAll("li")) as HTMLElement[];
    expect(pills[0].querySelector("[data-live-dot]")).not.toBeNull();
    expect(pills[0].querySelector("[data-queued-dot]")).toBeNull();
    expect(pills[1].getAttribute("data-run-phase")).toBe("queued");
    expect(pills[1].querySelector("[data-queued-dot]")).not.toBeNull();
    expect(pills[1].querySelector("[data-live-dot]")).toBeNull();
    act(() => root.unmount());
  });

  it("falls back to the narration when the run has no ticket, and offers no link", () => {
    const root = render([
      { company, run: run({ issueId: null }), issue: undefined, startedMs: 0, phase: "working" },
    ]);
    expect(container.textContent).toContain("Drafting section 2");
    expect(container.querySelector("li a")).toBeNull();
    act(() => root.unmount());
  });

  it("scrolls sideways rather than truncating, so the count and the pills agree", () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      company,
      run: run({ id: `r${index}` }),
      issue,
      startedMs: index,
      phase: "working" as const,
    }));
    const root = render(entries);
    expect(container.querySelectorAll("li")).toHaveLength(12);
    expect(container.querySelector("ul")?.className).toContain("overflow-x-auto");
    expect(container.textContent).not.toContain("more run");
    act(() => root.unmount());
  });

  it("says the fleet is idle when nothing is running", () => {
    const root = render([]);
    expect(container.textContent).toContain("idle — no agents running anywhere");
    expect(container.querySelector("li")).toBeNull();
    act(() => root.unmount());
  });
});
