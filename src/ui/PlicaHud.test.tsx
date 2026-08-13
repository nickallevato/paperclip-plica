// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlicaHud } from "./PlicaHud";

const mockCompaniesApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockDashboardApi = vi.hoisted(() => ({ summary: vi.fn() }));

vi.mock("./host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./host/api")>()),
  companiesApi: mockCompaniesApi,
  dashboardApi: mockDashboardApi,
}));
vi.mock("./host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./host/shims")>()),
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));
vi.mock("./components/PlicaCompanySlot", () => ({
  PlicaCompanySlot: ({ company, view }: { company: { name: string }; view: string }) => (
    <div data-view={view}>pane:{company.name}</div>
  ),
}));
vi.mock("./components/PlicaBriefing", () => ({
  PlicaBriefing: ({ since }: { since: string }) => <div data-testid="briefing">briefing since {since}</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const summaryFor = (companyId: string, running: number, pendingApprovals: number) => ({
  companyId,
  agents: { active: 5, running, paused: 0, error: 0 },
  tasks: { open: 1, inProgress: 1, blocked: 0, done: 1 },
  costs: { monthSpendCents: 0, monthBudgetCents: 0, monthUtilizationPercent: 0 },
  pendingApprovals,
  budgets: { activeIncidents: 0, pendingApprovals, pausedAgents: 0, pausedProjects: 0 },
  runActivity: [],
});

describe("PlicaHud", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    localStorage.removeItem("plica.view");
    localStorage.removeItem("plica.lastVisit");
    mockCompaniesApi.list.mockResolvedValue([
      { id: "c1", name: "Acme", status: "active", issuePrefix: "ACM" },
      { id: "c2", name: "Globex", status: "active", issuePrefix: "GLO" },
      { id: "c3", name: "Gone", status: "archived", issuePrefix: "GON" },
    ]);
    mockDashboardApi.summary.mockImplementation((companyId: string) =>
      Promise.resolve(companyId === "c1" ? summaryFor("c1", 2, 1) : summaryFor("c2", 1, 0)),
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders a pane per active company and totals in the global bar", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain("pane:Acme");
      expect(container.textContent).toContain("pane:Globex");
      expect(container.textContent).not.toContain("pane:Gone");
      expect(container.textContent).toContain("3 running");     // 2 + 1
      expect(container.textContent).toContain("1 approval");    // pending total
    });
    act(() => root.unmount());
  });

  it("switches layout modes and persists the choice", async () => {
    localStorage.removeItem("plica.layout");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.querySelector('[data-layout="auto"]')).not.toBeNull();
    });

    const twoButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "2",
    );
    expect(twoButton).not.toBeUndefined();
    await act(async () => {
      twoButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const grid = container.querySelector('[data-layout="2"]');
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("grid-cols-2");
    expect(localStorage.getItem("plica.layout")).toBe("2");
    act(() => root.unmount());
  });

  it("switches view modes, persists the choice, and renders a single-column triage list instead of a grid", async () => {
    localStorage.removeItem("plica.view");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.querySelector('[data-layout]')).not.toBeNull();
    });

    // Wall is the default: a grid of slots, none in triage view.
    expect(container.querySelectorAll('[data-view="wall"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-view="triage"]')).toBeNull();

    const triageButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Triage",
    );
    expect(triageButton).not.toBeUndefined();
    await act(async () => {
      triageButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(container.querySelector('[data-view="triage"]')).not.toBeNull();
    });
    // No grid layout wrapper when in triage view.
    expect(container.querySelector('[data-layout]')).toBeNull();
    expect(localStorage.getItem("plica.view")).toBe("triage");

    act(() => root.unmount());
  });

  it("requests fullscreen on the kiosk button (jsdom lacks the real fullscreen API, so it's stubbed)", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Element.prototype as any).requestFullscreen = requestFullscreen;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.querySelector('[aria-label="Enter kiosk mode"]')).not.toBeNull();
    });

    const kioskButton = container.querySelector('[aria-label="Enter kiosk mode"]') as HTMLButtonElement;
    await act(async () => {
      kioskButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("toggles alerts on and persists the choice", async () => {
    localStorage.removeItem("plica.alerts");
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.querySelector('[aria-label="Enable alerts"]')).not.toBeNull();
    });

    const bellButton = container.querySelector('[aria-label="Enable alerts"]') as HTMLButtonElement;
    await act(async () => {
      bellButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(localStorage.getItem("plica.alerts")).toBe("on");
    expect(container.querySelector('[aria-label="Disable alerts"]')).not.toBeNull();

    act(() => root.unmount());
  });

  it("shows the briefing strip when the last visit is old", async () => {
    localStorage.setItem("plica.lastVisit", new Date(Date.now() - 60 * 60_000).toISOString());
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="briefing"]')).not.toBeNull();
    });
    act(() => root.unmount());
  });

  it("does not show the briefing strip when there is no recorded visit, or it was recent", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain("pane:Acme");
    });
    expect(container.querySelector('[data-testid="briefing"]')).toBeNull();
    act(() => root.unmount());
  });

  it("persists the pane-order mode", async () => {
    localStorage.removeItem("plica.sort");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.querySelector('[aria-label="Pane order"]')).not.toBeNull();
    });
    const hotButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Hot first",
    );
    await act(async () => {
      hotButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(localStorage.getItem("plica.sort")).toBe("hot");
    act(() => root.unmount());
  });

  it("docks collapsed companies out of the grid into the docked strip", async () => {
    localStorage.setItem("plica.collapsed", JSON.stringify(["c1"]));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.querySelector("[data-docked]")).not.toBeNull();
    });
    const docked = container.querySelector("[data-docked]");
    expect(docked?.textContent).toContain("Acme");
    expect(container.textContent).not.toContain("pane:Acme");
    expect(container.textContent).toContain("pane:Globex");
    localStorage.removeItem("plica.collapsed");
    act(() => root.unmount());
  });

  it("docks and undocks every company via the header buttons, persisting the choice", async () => {
    localStorage.removeItem("plica.collapsed");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaHud />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain("pane:Acme");
    });

    const dockAll = container.querySelector<HTMLButtonElement>('button[aria-label="Dock all companies"]');
    const undockAll = container.querySelector<HTMLButtonElement>('button[aria-label="Undock all companies"]');
    expect(dockAll).not.toBeNull();
    expect(undockAll).not.toBeNull();
    // Nothing docked yet: undock-all is a no-op and disabled.
    expect(dockAll!.disabled).toBe(false);
    expect(undockAll!.disabled).toBe(true);

    await act(async () => {
      dockAll!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("pane:Acme");
    expect(container.textContent).not.toContain("pane:Globex");
    const docked = container.querySelector("[data-docked]");
    expect(docked?.textContent).toContain("Acme");
    expect(docked?.textContent).toContain("Globex");
    expect(JSON.parse(localStorage.getItem("plica.collapsed") ?? "[]").sort()).toEqual(["c1", "c2"]);
    // Everything docked now: dock-all is the no-op.
    expect(dockAll!.disabled).toBe(true);
    expect(undockAll!.disabled).toBe(false);

    await act(async () => {
      undockAll!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("pane:Acme");
    expect(container.textContent).toContain("pane:Globex");
    expect(container.querySelector("[data-docked]")).toBeNull();
    expect(JSON.parse(localStorage.getItem("plica.collapsed") ?? "[]")).toEqual([]);

    localStorage.removeItem("plica.collapsed");
    act(() => root.unmount());
  });
});
