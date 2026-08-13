// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlicaCompanySlot } from "./PlicaCompanySlot";

const dialogActions = vi.hoisted(() => ({ openNewIssue: vi.fn() }));
const mockDashboardApi = vi.hoisted(() => ({ summary: vi.fn() }));
const mockActivityApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockHeartbeatsApi = vi.hoisted(() => ({ liveRunsForCompany: vi.fn() }));
const mockProjectsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockIssuesApi = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), addComment: vi.fn(), get: vi.fn() }));
const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockApprovalsApi = vi.hoisted(() => ({ list: vi.fn(), approve: vi.fn(), reject: vi.fn() }));
const mockSidebarBadgesApi = vi.hoisted(() => ({ get: vi.fn() }));
const mockAttentionApi = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
  useDialogActions: () => dialogActions,
  useToastActions: () => ({ pushToast: vi.fn() }),
}));
vi.mock("../host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/api")>()),
  dashboardApi: mockDashboardApi,
  activityApi: mockActivityApi,
  heartbeatsApi: mockHeartbeatsApi,
  projectsApi: mockProjectsApi,
  issuesApi: mockIssuesApi,
  agentsApi: mockAgentsApi,
  approvalsApi: mockApprovalsApi,
  sidebarBadgesApi: mockSidebarBadgesApi,
  attentionApi: mockAttentionApi,
}));

// ActivityRow's Link (@/lib/router) calls useCompany(), which requires a
// CompanyProvider ancestor. This pane test tree intentionally has none (Plica
// components must never depend on the single-company context), so we stub
// NOTE: the original test also mocked "@/components/ActivityRow" for a
// PlicaActivityTicker that no longer exists in the component tree. Nothing
// imports ActivityRow, so the stale mock was dropped during the port.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const company = {
  id: "company-1",
  name: "Acme Robotics",
  status: "active",
  issuePrefix: "ACM",
  brandColor: "#123456",
} as never;

const summary = {
  companyId: "company-1",
  agents: { active: 4, running: 2, paused: 0, error: 0 },
  tasks: { open: 6, inProgress: 3, blocked: 1, done: 20 },
  costs: { monthSpendCents: 123_45, monthBudgetCents: 500_00, monthUtilizationPercent: 25 },
  pendingApprovals: 1,
  budgets: { activeIncidents: 0, pendingApprovals: 1, pausedAgents: 0, pausedProjects: 0 },
  runActivity: [],
};

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderPane(container: HTMLDivElement, alertsEnabled = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PlicaCompanySlot company={company} view="wall" alertsEnabled={alertsEnabled} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return { root, queryClient };
}

describe("PlicaCompanyPane", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockDashboardApi.summary.mockResolvedValue(summary);
    mockActivityApi.list.mockResolvedValue([]);
    mockHeartbeatsApi.liveRunsForCompany.mockResolvedValue([]);
    mockProjectsApi.list.mockResolvedValue([
      { id: "p1", name: "Orbital", status: "active", archivedAt: null, updatedAt: new Date("2026-07-01"), urlKey: "orbital" },
    ]);
    mockIssuesApi.list.mockResolvedValue([
      { id: "i1", projectId: "p1", status: "todo" },
      { id: "i2", projectId: "p1", status: "done" },
    ]);
    mockAgentsApi.list.mockResolvedValue([]);
    mockApprovalsApi.list.mockResolvedValue([]);
    mockSidebarBadgesApi.get.mockResolvedValue({ inbox: 0, approvals: 0, failedRuns: 0, joinRequests: 0 });
    mockAttentionApi.list.mockResolvedValue({ companyId: "company-1", generatedAt: "", totalCount: 0, countsBySourceKind: {}, items: [] });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders name, vitals, health, and project chips", async () => {
    const { root } = renderPane(container);
    await flush();
    await flush();

    // The pane body (vitals/projects) is gated behind the first-load state
    // and only mounts once every query has resolved; under parallel test
    // load two flush()es aren't a reliable deadline, so poll instead.
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Acme Robotics");
      expect(container.textContent).toContain("2");            // agents running
      expect(container.textContent).toContain("3");            // tasks in progress
      expect(container.textContent).toContain("$123.45");      // month spend
      expect(container.querySelector('[data-health="amber"]')).not.toBeNull(); // pendingApprovals=1
      expect(container.textContent).toContain("Orbital");
      expect(container.textContent).toContain("1");            // open count for p1 (done excluded)
    });

    act(() => root.unmount());
  });

  // The host's new-issue dialog is unreachable from plugin UI, so the shim's
  // openNewIssue navigates to the company's issues page instead. The pane now
  // also passes companyPrefix, which building that URL requires and the host's
  // own signature did not take.
  it("targets the new-issue action at this company", async () => {
    const { root } = renderPane(container);
    await flush();

    // The "+ Ticket" footer only renders once the pane leaves its
    // first-load state; under parallel test load a single flush() isn't a
    // reliable deadline for that, so poll for the button instead.
    let ticketButton: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      ticketButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Ticket")) as HTMLButtonElement | undefined;
      expect(ticketButton).not.toBeUndefined();
    });
    await act(async () => {
      ticketButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(dialogActions.openNewIssue).toHaveBeenCalledWith({
      companyId: "company-1",
      companyPrefix: "ACM",
    });
    act(() => root.unmount());
  });

  it("shows a stale ribbon when polling fails after data was loaded", async () => {
    const { root, queryClient } = renderPane(container);
    await flush();
    await flush();
    expect(container.textContent).not.toContain("Stale since");

    mockDashboardApi.summary.mockRejectedValue(new Error("boom"));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["plica", "summary", "company-1"] }).catch(() => undefined);
    });
    await flush();

    expect(container.textContent).toContain("Stale since");
    act(() => root.unmount());
  });

  it("shows active runs with agent name and issue title", async () => {
    mockHeartbeatsApi.liveRunsForCompany.mockResolvedValue([
      {
        id: "run-1",
        status: "running",
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        agentId: "agent-1",
        agentName: "Fixer",
        adapterType: "claude",
        issueId: "i1",
        invocationSource: "heartbeat",
        triggerDetail: null,
      },
    ]);
    mockIssuesApi.list.mockResolvedValue([
      { id: "i1", projectId: "p1", status: "in_progress", title: "Repair the flux", identifier: "ACM-7" },
    ]);

    const { root } = renderPane(container);
    await flush();
    await flush();

    // Run rows only render once the pane leaves its first-load state.
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Fixer");
      expect(container.textContent).toContain("Repair the flux");
    });
    act(() => root.unmount());
  });



  it("shows an unavailable state, not a healthy empty pane, when the summary fails on the very first poll (finding 2)", async () => {
    mockDashboardApi.summary.mockRejectedValue(new Error("network down"));

    const { root } = renderPane(container);
    await flush();
    await flush();
    await flush();

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Acme Robotics");
      expect(container.textContent).toContain("Unreachable");
      expect(container.querySelector('[data-health="green"]')).toBeNull();
      expect(container.querySelector('[data-health="red"]')).not.toBeNull();
    });

    act(() => root.unmount());
  });

  it("shows a loading state before any data has arrived", async () => {
    let resolveSummary!: (value: typeof summary) => void;
    mockDashboardApi.summary.mockReturnValue(
      new Promise((resolve) => {
        resolveSummary = resolve;
      }),
    );

    const { root } = renderPane(container);
    await flush();

    expect(container.textContent).toContain("Loading");
    expect(container.textContent).not.toContain("Unreachable");

    await act(async () => {
      resolveSummary(summary);
    });
    await flush();
    await flush();

    act(() => root.unmount());
  });

  it("shows the CEO strip with heartbeat state, and inbox/failed footer badges", async () => {
    mockAgentsApi.list.mockResolvedValue([
      { id: "agent-1", name: "Worker", role: "engineer", status: "active", urlKey: "worker", lastHeartbeatAt: null, runtimeConfig: {} },
      {
        id: "agent-2",
        name: "Prime",
        role: "ceo",
        status: "active",
        urlKey: "prime",
        lastHeartbeatAt: new Date().toISOString(),
        runtimeConfig: { heartbeat: { enabled: true, intervalSec: 1800 } },
      },
    ]);
    mockSidebarBadgesApi.get.mockResolvedValue({ inbox: 5, approvals: 0, failedRuns: 2, joinRequests: 0 });

    const { root } = renderPane(container);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Prime");
      expect(container.querySelector('[data-ceo-beat="ok"]')).not.toBeNull();
      expect(container.textContent).toContain("Inbox 5");
      expect(container.textContent).toContain("Failed 2");
    });
    act(() => root.unmount());
  });

  it("renders ranked attention items with severity and whyNow", async () => {
    mockAttentionApi.list.mockResolvedValue({
      companyId: "company-1",
      generatedAt: "2026-07-28T00:00:00Z",
      totalCount: 7,
      countsBySourceKind: {},
      items: [
        {
          id: "att-1",
          companyId: "company-1",
          sourceKind: "blocker_attention",
          severity: "critical",
          rank: 1,
          whyNow: "Blocked for 2 days",
          dismissal: null,
          subject: { kind: "issue", id: "i9", companyId: "company-1", title: "Fix deploy", identifier: "ACM-9", status: "blocked", href: "/ACM/issues/ACM-9" },
        },
        {
          id: "att-2",
          companyId: "company-1",
          sourceKind: "failed_run",
          severity: "high",
          rank: 2,
          whyNow: "Run failed twice",
          dismissal: { dismissedAt: "2026-07-28T00:00:00Z" },
          subject: { kind: "run", id: "r1", companyId: "company-1", title: "Nightly sync", identifier: null, status: null, href: null },
        },
      ],
    });

    const { root } = renderPane(container);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Needs attention");
      expect(container.textContent).toContain("Fix deploy");
      expect(container.textContent).toContain("Blocked for 2 days");
      const criticalCard = Array.from(container.querySelectorAll("li"))
        .find((li) => li.className.includes("border-red-500"));
      expect(criticalCard).not.toBeUndefined();
    });
    expect(container.textContent).not.toContain("Nightly sync");
    const link = Array.from(container.querySelectorAll("a"))
      .find((a) => a.getAttribute("href") === "/ACM/issues/ACM-9");
    expect(link).not.toBeUndefined();
    act(() => root.unmount());
  });

  describe("alerts (no stale-burst-on-load, regression)", () => {
    let notificationCtor: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

    beforeEach(() => {
      notificationCtor = vi.fn();
      class StubNotification {
        static permission = "granted";
        constructor(...args: unknown[]) {
          notificationCtor(...args);
        }
      }
      vi.stubGlobal("Notification", StubNotification);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("fires zero Notifications when the pane's initial data is already red", async () => {
      mockDashboardApi.summary.mockResolvedValue({
        ...summary,
        agents: { ...summary.agents, error: 1 },
        budgets: { ...summary.budgets, activeIncidents: 1 },
      });

      const { root } = renderPane(container, true);
      await vi.waitFor(() => {
        expect(container.querySelector('[data-health="red"]')).not.toBeNull();
      });
      // Give any (incorrect) baseline-then-immediate-refire logic a chance to run.
      await flush();
      await flush();

      expect(notificationCtor).not.toHaveBeenCalled();
      act(() => root.unmount());
    });

    it("fires exactly one Notification when a later poll flips health to red", async () => {
      mockDashboardApi.summary.mockResolvedValueOnce(summary); // green/amber baseline
      mockDashboardApi.summary.mockResolvedValue({
        ...summary,
        agents: { ...summary.agents, error: 1 },
        budgets: { ...summary.budgets, activeIncidents: 1 },
      });

      const { root, queryClient } = renderPane(container, true);
      await vi.waitFor(() => {
        expect(container.querySelector('[data-health="amber"]')).not.toBeNull();
      });
      expect(notificationCtor).not.toHaveBeenCalled();

      await act(async () => {
        await queryClient.refetchQueries({ queryKey: ["plica"] });
      });
      await vi.waitFor(() => {
        expect(container.querySelector('[data-health="red"]')).not.toBeNull();
      });

      expect(notificationCtor).toHaveBeenCalledTimes(1);
      act(() => root.unmount());
    });
  });

  it("ghosts the cost cell, re-emphasizing it when budget utilization is hot", async () => {
    // The cost chit is inert (no click action), so it renders as a labeled
    // group, not a disabled button.
    const findCost = () =>
      Array.from(container.querySelectorAll('[role="group"]'))
        .find((el) => el.getAttribute("aria-label")?.startsWith("Month spend"));
    const { root } = renderPane(container);
    await vi.waitFor(() => {
      const cost = findCost();
      expect(cost).not.toBeUndefined();
      expect(cost?.className).toContain("border-dashed");
    });
    act(() => root.unmount());

    mockDashboardApi.summary.mockResolvedValue({
      ...summary,
      costs: { monthSpendCents: 450_00, monthBudgetCents: 500_00, monthUtilizationPercent: 90 },
    });
    const second = renderPane(container);
    await vi.waitFor(() => {
      expect(findCost()?.className).toContain("border-amber-500/40");
    });
    act(() => second.root.unmount());
  });

  it("shows the live now-line with the running agent's narration and a hover ticket preview", async () => {
    mockHeartbeatsApi.liveRunsForCompany.mockResolvedValue([
      {
        id: "run-9",
        status: "running",
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        agentId: "agent-1",
        agentName: "Fixer",
        adapterType: "claude",
        issueId: "i1",
        invocationSource: "heartbeat",
        triggerDetail: null,
        currentStatusMessage: "writing integration tests for ACM-7",
      },
    ]);
    mockIssuesApi.list.mockResolvedValue([
      { id: "i1", projectId: "p1", status: "in_progress", title: "Repair the flux", identifier: "ACM-7" },
    ]);
    mockIssuesApi.get.mockResolvedValue({
      id: "i1", identifier: "ACM-7", title: "Repair the flux", status: "in_progress",
      description: "The flux capacitor intermittently drops auth tokens.",
    });

    const { root } = renderPane(container);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Fixer");
      expect(container.textContent).toContain("writing integration tests for ACM-7");
    });

    // The narration is now a real link to the issue; focusing it (bubbling to
    // the hover anchor) opens the portaled preview card.
    const narrationLink = Array.from(container.querySelectorAll("a"))
      .find((el) => el.textContent?.includes("writing integration tests"));
    expect(narrationLink).not.toBeUndefined();
    expect(narrationLink?.getAttribute("href")).toBe("/ACM/issues/ACM-7");
    await act(async () => {
      narrationLink!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await vi.waitFor(() => {
      const card = document.querySelector("[data-issue-hover]");
      expect(card).not.toBeNull();
      expect(card?.textContent).toContain("drops auth tokens");
    });
    act(() => root.unmount());
  });

});
