// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlicaCompanySlot } from "./PlicaCompanySlot";

const mockDashboardApi = vi.hoisted(() => ({ summary: vi.fn() }));
const mockHeartbeatsApi = vi.hoisted(() => ({ liveRunsForCompany: vi.fn() }));
const mockProjectsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockIssuesApi = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), addComment: vi.fn(), get: vi.fn() }));
const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockApprovalsApi = vi.hoisted(() => ({ list: vi.fn(), approve: vi.fn(), reject: vi.fn() }));
const mockSidebarBadgesApi = vi.hoisted(() => ({ get: vi.fn() }));
const mockAttentionApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockCostsApi = vi.hoisted(() => ({ byAgent: vi.fn() }));

vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
  useDialogActions: () => ({ openNewIssue: vi.fn() }),
  useToastActions: () => ({ pushToast: vi.fn() }),
}));
vi.mock("../host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/api")>()),
  dashboardApi: mockDashboardApi,
  heartbeatsApi: mockHeartbeatsApi,
  projectsApi: mockProjectsApi,
  issuesApi: mockIssuesApi,
  agentsApi: mockAgentsApi,
  approvalsApi: mockApprovalsApi,
  sidebarBadgesApi: mockSidebarBadgesApi,
  attentionApi: mockAttentionApi,
  costsApi: mockCostsApi,
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
  costs: { monthSpendCents: 0, monthBudgetCents: 500_00, monthUtilizationPercent: 0 },
  pendingApprovals: 0,
  budgets: { activeIncidents: 0, pendingApprovals: 0, pausedAgents: 0, pausedProjects: 0 },
  runActivity: [],
};

function attentionItem(id: string, sourceKind: string, severity: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    companyId: "company-1",
    sourceKind,
    severity,
    rank: 0,
    whyNow: `why ${id}`,
    dismissal: null,
    decisionVerbs: [],
    inlineResolvable: false,
    activityAt: null,
    detail: null,
    subject: {
      kind: "issue",
      id: `subject-${id}`,
      companyId: "company-1",
      title: `Subject ${id}`,
      identifier: `ACM-${id}`,
      status: null,
      href: null,
    },
    ...extra,
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function render(
  container: HTMLDivElement,
  view: "signal" | "matrix" | "scoreboard",
  onUnpin?: () => void,
  onStats?: (companyId: string, stats: unknown) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          {view === "signal" ? (
            <PlicaCompanySlot company={company} view="signal" onUnpin={onUnpin} onStats={onStats as never} />
          ) : (
            <table>
              <tbody>
                <PlicaCompanySlot company={company} view={view} onUnpin={onUnpin} onStats={onStats as never} />
              </tbody>
            </table>
          )}
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return { root, queryClient };
}

describe("PlicaSignalCard / PlicaMatrixRow", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockDashboardApi.summary.mockResolvedValue(summary);
    mockHeartbeatsApi.liveRunsForCompany.mockResolvedValue([]);
    mockProjectsApi.list.mockResolvedValue([]);
    mockIssuesApi.list.mockResolvedValue([]);
    mockAgentsApi.list.mockResolvedValue([]);
    mockApprovalsApi.list.mockResolvedValue([]);
    mockSidebarBadgesApi.get.mockResolvedValue({ inbox: 0, approvals: 0, failedRuns: 0, joinRequests: 0 });
    mockCostsApi.byAgent.mockResolvedValue([
      { inputTokens: 300_000_000, cachedInputTokens: 0, outputTokens: 20_000_000 },
    ]);
    mockAttentionApi.list.mockResolvedValue({
      companyId: "company-1",
      generatedAt: "",
      totalCount: 3,
      countsBySourceKind: {},
      items: [
        attentionItem("1", "failed_run", "critical"),
        attentionItem("2", "failed_run", "high"),
        attentionItem("3", "approval", "medium"),
        attentionItem("4", "approval", "critical", { dismissal: { dismissedAt: "2026-08-01T00:00:00Z" } }),
      ],
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows the company, a live total that excludes dismissed items, and per-kind counts", async () => {
    render(container, "signal");
    await flush();

    await vi.waitFor(() => {
      const card = container.querySelector('[data-signal-card="company-1"]');
      expect(card).not.toBeNull();
      expect(card?.textContent).toContain("Acme Robotics");
      // 4 items, one dismissed
      expect(container.querySelector("[data-signal-total]")?.textContent).toBe("3");
      const failed = container.querySelector('button[title="Failed: 2"]');
      const approve = container.querySelector('button[title="Approve: 1"]');
      expect(failed).not.toBeNull();
      expect(approve).not.toBeNull();
    });
  });

  it("disables kinds with nothing in them so the eye skips them", async () => {
    render(container, "signal");
    await flush();

    await vi.waitFor(() => {
      const empty = container.querySelector('button[title="Access: 0"]') as HTMLButtonElement | null;
      expect(empty).not.toBeNull();
      expect(empty?.disabled).toBe(true);
    });
  });

  it("drills a kind open in place, then closed again", async () => {
    render(container, "signal");
    await flush();

    let failed: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      failed = container.querySelector('button[title="Failed: 2"]');
      expect(failed).not.toBeNull();
    });
    expect(container.querySelector("[data-signal-drill]")).toBeNull();

    await act(async () => {
      failed!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const drill = container.querySelector("[data-signal-drill]");
    expect(drill).not.toBeNull();
    // both failed_run items, and not the approval
    expect(drill?.querySelectorAll("li")).toHaveLength(2);
    expect(failed!.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      failed!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("[data-signal-drill]")).toBeNull();
  });

  it("offers an unpin control only when the company is pinned", async () => {
    const onUnpin = vi.fn();
    render(container, "signal", onUnpin);
    await flush();

    let button: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      button = container.querySelector('button[aria-label="Unpin Acme Robotics"]');
      expect(button).not.toBeNull();
    });
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onUnpin).toHaveBeenCalledTimes(1);
  });

  it("renders the matrix presentation as one row of per-kind cells", async () => {
    render(container, "matrix");
    await flush();

    await vi.waitFor(() => {
      const row = container.querySelector('[data-matrix-row="company-1"]');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain("Acme Robotics");
      expect(container.querySelector('[title="Acme Robotics · Failed: 2"]')).not.toBeNull();
      expect(container.querySelector('[title="Acme Robotics · Approve: 1"]')).not.toBeNull();
    });
  });
});

describe("PlicaScoreboardRow", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockDashboardApi.summary.mockResolvedValue(summary);
    mockHeartbeatsApi.liveRunsForCompany.mockResolvedValue([]);
    mockProjectsApi.list.mockResolvedValue([]);
    mockIssuesApi.list.mockResolvedValue([]);
    mockAgentsApi.list.mockResolvedValue([]);
    mockApprovalsApi.list.mockResolvedValue([]);
    mockSidebarBadgesApi.get.mockResolvedValue({ inbox: 7, approvals: 0, failedRuns: 0, joinRequests: 0 });
    mockAttentionApi.list.mockResolvedValue({
      companyId: "company-1",
      generatedAt: "",
      totalCount: 2,
      countsBySourceKind: {},
      items: [attentionItem("1", "failed_run", "critical"), attentionItem("2", "approval", "medium")],
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("lays the company's whole state out as one row and reports stats upward", async () => {
    const onStats = vi.fn();
    mockCostsApi.byAgent.mockResolvedValue([
      { inputTokens: 600_000_000, cachedInputTokens: 0, outputTokens: 0 },
    ]);
    render(container, "scoreboard", undefined, onStats);
    await flush();

    await vi.waitFor(() => {
      const row = container.querySelector('[data-scoreboard-row="company-1"]');
      expect(row).not.toBeNull();
      const text = row?.textContent ?? "";
      expect(text).toContain("Acme Robotics");
      expect(text).toContain("2");      // agents running
      expect(text).toContain("600M");   // month tokens, over the 500M default crit
      expect(text).toContain("7");      // inbox badge
    });

    await vi.waitFor(() => {
      const last = onStats.mock.calls.at(-1);
      expect(last?.[0]).toBe("company-1");
      expect(last?.[1]).toMatchObject({ running: 2, needs: 2, critical: 1, failed: 1, inbox: 7, tokens: 600_000_000 });
    });
  });

  it("shows a dash rather than a zero when cost access is denied", async () => {
    mockCostsApi.byAgent.mockRejectedValue(new Error("403"));
    render(container, "scoreboard");
    await flush();

    await vi.waitFor(() => {
      const row = container.querySelector('[data-scoreboard-row="company-1"]');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain("\u2014");
    });
  });
});
