// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Company, Issue } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../host/api";
import { PlicaRunsStrip } from "./PlicaRunsStrip";

const mockIssuesApi = vi.hoisted(() => ({ addComment: vi.fn(), update: vi.fn(), get: vi.fn() }));
vi.mock("../host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/api")>()),
  issuesApi: mockIssuesApi,
}));

vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
  useToastActions: () => ({ pushToast: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeRun(overrides: Partial<LiveRunForIssue>): LiveRunForIssue {
  return {
    id: "run-1",
    status: "running",
    invocationSource: "scheduler",
    triggerDetail: "heartbeat",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    agentId: "agent-1",
    agentName: "Quill",
    adapterType: "claude_local",
    issueId: "issue-1",
    ...overrides,
  };
}

const issues = [{ id: "issue-1", title: "Write the launch blog post" } as Issue];
const company = { id: "company-1", name: "Acme", issuePrefix: "ACM", status: "active" } as Company;

describe("PlicaRunsStrip", () => {
  let container: HTMLDivElement;

  function render(runs: LiveRunForIssue[]) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaRunsStrip runs={runs} issues={issues} company={company} onActed={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    return root;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it("shows the run's live narration instead of the static issue title", () => {
    render([makeRun({ currentStatusMessage: "Drafting the intro section" })]);
    expect(container.textContent).toContain("Quill");
    expect(container.textContent).toContain("Drafting the intro section");
    expect(container.textContent).not.toContain("Write the launch blog post");
  });

  it("falls back nextAction -> issue title when no live status message exists", () => {
    render([makeRun({ currentStatusMessage: null, nextAction: "Review draft with CEO" })]);
    expect(container.textContent).toContain("Review draft with CEO");

    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    render([makeRun({ currentStatusMessage: null, nextAction: null })]);
    expect(container.textContent).toContain("Write the launch blog post");
  });

  it("shows the pulsing live dot for a running agent but not a queued one", () => {
    render([makeRun({ currentStatusMessage: "Drafting the intro section" })]);
    expect(container.querySelector("[data-live-dot]")).not.toBeNull();

    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    render([makeRun({ status: "queued" })]);
    expect(container.querySelector("[data-live-dot]")).toBeNull();
  });

  it("renders the faint idle line when nothing is running", () => {
    render([makeRun({ status: "completed" })]);
    expect(container.textContent).toContain("idle — no agents running");
  });
});
