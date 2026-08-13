// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Company, Issue } from "@paperclipai/shared";
import { PlicaBriefing } from "./PlicaBriefing";

const mockWorkTimelineApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/api")>()),
  workTimelineApi: mockWorkTimelineApi,
  issuesApi: mockIssuesApi,
}));

const mockIssuesApi = vi.hoisted(() => ({ list: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SINCE = "2026-07-29T10:00:00.000Z";
const AFTER_SINCE = "2026-07-29T11:00:00.000Z";

const companyA = { id: "c1", name: "Acme", status: "active", issuePrefix: "ACM" } as Company;
const companyB = { id: "c2", name: "Globex", status: "active", issuePrefix: "GLO" } as Company;

function emptyTimeline() {
  return {
    actors: [],
    spans: [],
    events: [],
    edges: [],
    pagination: { limit: 200, offset: 0, totalIssues: 0, hasMore: false },
    window: { from: "2026-07-29T00:00:00.000Z", to: "2026-07-29T12:00:00.000Z", capped: false },
  };
}

function timelineWithFailedSpans(count: number) {
  return {
    ...emptyTimeline(),
    spans: Array.from({ length: count }, (_, index) => ({
      actorId: "agent:a1",
      laneHint: null,
      runId: `run-${index}`,
      issueId: `issue-${index}`,
      issueIdentifier: null,
      issueTitle: null,
      start: "2026-07-29T10:30:00.000Z",
      end: "2026-07-29T10:35:00.000Z",
      status: "failed",
    })),
  };
}

function issueWith(status: string, updatedAt: string): Issue {
  return { id: `issue-${status}-${updatedAt}`, status, updatedAt } as unknown as Issue;
}

function render(companies: Company[], since: string, onDismiss = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <PlicaBriefing companies={companies} since={since} onDismiss={onDismiss} />
      </QueryClientProvider>,
    );
  });
  return { container, root, onDismiss };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("PlicaBriefing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows a compiling placeholder while loading", async () => {
    mockWorkTimelineApi.get.mockImplementation(() => new Promise(() => {}));
    mockIssuesApi.list.mockImplementation(() => new Promise(() => {}));
    const { container, root } = render([companyA], SINCE);
    expect(container.textContent).toContain("Compiling briefing…");
    act(() => root.unmount());
  });

  it("fetches per-company timeline and done/blocked issues with the expected params", async () => {
    mockWorkTimelineApi.get.mockResolvedValue(emptyTimeline());
    mockIssuesApi.list.mockResolvedValue([]);
    const { root } = render([companyA, companyB], SINCE);
    await flush();

    expect(mockWorkTimelineApi.get).toHaveBeenCalledWith("c1", { from: SINCE, limit: 200 });
    expect(mockWorkTimelineApi.get).toHaveBeenCalledWith("c2", { from: SINCE, limit: 200 });
    expect(mockIssuesApi.list).toHaveBeenCalledWith("c1", { status: "done,blocked", limit: 200 });
    expect(mockIssuesApi.list).toHaveBeenCalledWith("c2", { status: "done,blocked", limit: 200 });

    act(() => root.unmount());
  });

  it("renders a line per company with nonzero counts and omits zero parts", async () => {
    mockWorkTimelineApi.get.mockImplementation((companyId: string) =>
      Promise.resolve(companyId === "c1" ? timelineWithFailedSpans(1) : emptyTimeline()),
    );
    mockIssuesApi.list.mockImplementation((companyId: string) =>
      Promise.resolve(
        companyId === "c1" ? [issueWith("done", AFTER_SINCE)] : [issueWith("blocked", AFTER_SINCE)],
      ),
    );
    const { container, root } = render([companyA, companyB], SINCE);
    await flush();

    const acmeLine = Array.from(container.querySelectorAll("li")).find((li) => li.textContent?.startsWith("Acme:"));
    expect(acmeLine?.textContent).toContain("1 done");
    expect(acmeLine?.textContent).toContain("1 failed run");
    expect(acmeLine?.textContent).not.toContain("blocker"); // Acme had no blockers — part omitted

    const globexLine = Array.from(container.querySelectorAll("li")).find((li) => li.textContent?.startsWith("Globex:"));
    expect(globexLine?.textContent).toContain("1 new blocker");

    act(() => root.unmount());
  });

  it("omits an all-zero company and shows the all-quiet message when every company is zero", async () => {
    mockWorkTimelineApi.get.mockResolvedValue(emptyTimeline());
    mockIssuesApi.list.mockResolvedValue([]);
    const { container, root } = render([companyA, companyB], SINCE);
    await flush();

    expect(container.textContent).not.toContain("Acme:");
    expect(container.textContent).not.toContain("Globex:");
    expect(container.textContent).toContain("All quiet since");

    act(() => root.unmount());
  });

  it("omits a company whose only done/blocked issues were updated before sinceIso", async () => {
    mockWorkTimelineApi.get.mockResolvedValue(emptyTimeline());
    mockIssuesApi.list.mockImplementation((companyId: string) =>
      Promise.resolve(
        companyId === "c1"
          ? [issueWith("done", AFTER_SINCE)]
          : [issueWith("done", "2026-07-29T09:00:00.000Z")], // stale — before `since`
      ),
    );
    const { container, root } = render([companyA, companyB], SINCE);
    await flush();

    expect(container.textContent).toContain("Acme:");
    expect(container.textContent).not.toContain("Globex:");

    act(() => root.unmount());
  });

  it("calls onDismiss when the Dismiss button is clicked", async () => {
    mockWorkTimelineApi.get.mockResolvedValue(emptyTimeline());
    mockIssuesApi.list.mockResolvedValue([]);
    const { container, root, onDismiss } = render([companyA], SINCE);
    await flush();

    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("Dismiss"),
    );
    expect(button).not.toBeUndefined();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});
