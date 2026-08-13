// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlicaCompanySlot } from "./PlicaCompanySlot";

const mockDashboardApi = vi.hoisted(() => ({ summary: vi.fn() }));
const mockActivityApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockHeartbeatsApi = vi.hoisted(() => ({ liveRunsForCompany: vi.fn() }));
const mockProjectsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockIssuesApi = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), addComment: vi.fn() }));
const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockApprovalsApi = vi.hoisted(() => ({ list: vi.fn(), approve: vi.fn(), reject: vi.fn() }));
const mockSidebarBadgesApi = vi.hoisted(() => ({ get: vi.fn() }));
const mockAttentionApi = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
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
  pendingApprovals: 0,
  budgets: { activeIncidents: 0, pendingApprovals: 0, pausedAgents: 0, pausedProjects: 0 },
  runActivity: [],
};

function renderTriage(container: HTMLDivElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PlicaCompanySlot company={company} view="triage" triageOpen={true} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return { root, queryClient };
}

describe("PlicaTriageSection", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockDashboardApi.summary.mockResolvedValue(summary);
    mockActivityApi.list.mockResolvedValue([]);
    mockHeartbeatsApi.liveRunsForCompany.mockResolvedValue([]);
    mockProjectsApi.list.mockResolvedValue([]);
    mockIssuesApi.list.mockResolvedValue([]);
    mockAgentsApi.list.mockResolvedValue([]);
    mockApprovalsApi.list.mockResolvedValue([]);
    mockSidebarBadgesApi.get.mockResolvedValue({ inbox: 0, approvals: 0, failedRuns: 0, joinRequests: 0 });
    mockAttentionApi.list.mockResolvedValue({ companyId: "company-1", generatedAt: "", totalCount: 0, countsBySourceKind: {}, items: [] });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders a muted clear row when there is nothing actionable", async () => {
    const { root } = renderTriage(container);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Acme Robotics");
      expect(container.textContent).toContain("all clear");
    });
    act(() => root.unmount());
  });

  it("renders pending approvals, attention items, and a CEO-overdue line when actionable", async () => {
    mockApprovalsApi.list.mockResolvedValue([
      { id: "appr-1", type: "spend_increase", companyId: "company-1", createdAt: new Date().toISOString() },
    ]);
    mockAttentionApi.list.mockResolvedValue({
      companyId: "company-1",
      generatedAt: "2026-07-29T00:00:00Z",
      totalCount: 1,
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
      ],
    });
    mockAgentsApi.list.mockResolvedValue([
      {
        id: "agent-ceo",
        name: "Prime",
        role: "ceo",
        status: "active",
        urlKey: "prime",
        lastHeartbeatAt: new Date("2026-01-01T00:00:00Z").toISOString(),
        runtimeConfig: { heartbeat: { enabled: true, intervalSec: 1800 } },
      },
    ]);

    const { root } = renderTriage(container);
    await vi.waitFor(() => {
      expect(container.textContent).toContain("spend_increase");
      expect(container.textContent).toContain("Fix deploy");
      expect(container.textContent).toContain("Prime");
      expect(container.textContent).toContain("overdue");
      expect(container.textContent).not.toContain("all clear");
    });
    act(() => root.unmount());
  });
});
