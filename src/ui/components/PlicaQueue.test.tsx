// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Company } from "@paperclipai/shared";
import { PlicaQueue } from "./PlicaQueue";
import { deriveQueueItems, groupQueue, summarizeQueue } from "../lib/queue";

const mockApprovalsApi = vi.hoisted(() => ({ approve: vi.fn(), reject: vi.fn(), listIssues: vi.fn() }));
const mockIssuesApi = vi.hoisted(() => ({ acceptInteraction: vi.fn(), rejectInteraction: vi.fn(), listInteractions: vi.fn() }));
vi.mock("../host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/api")>()),
  approvalsApi: mockApprovalsApi,
  issuesApi: mockIssuesApi,
}));
vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
  useToastActions: () => ({ pushToast: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.UTC(2026, 7, 21, 12);
const at = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();

const acme = { id: "c1", name: "Acme", issuePrefix: "ACM", status: "active" } as never as Company;
const globex = { id: "c2", name: "Globex", issuePrefix: "GLO", status: "active" } as never as Company;

function buildItems() {
  return [
    ...deriveQueueItems({
      companyId: "c1",
      approvals: [{ id: "ap-1", type: "budget_increase", createdAt: new Date(at(12)), payload: {} }] as never,
      attention: {
        items: [
          {
            id: "blk",
            severity: "critical",
            sourceKind: "blocker_attention",
            activityAt: at(60),
            dismissal: null,
            subject: { kind: "issue", id: "i-1", title: "Deploy blocked", identifier: "ACM-212", href: "/ACM/issues/ACM-212" },
            whyNow: "blocked",
            detail: null,
          },
          {
            id: "ask",
            severity: "medium",
            sourceKind: "issue_thread_interaction",
            activityAt: at(30),
            dismissal: null,
            subject: {
              kind: "interaction",
              id: "int-1",
              title: "Questions need answers",
              identifier: null,
              status: "pending",
              href: "/ACM/issues/ACM-77#interaction-int-1",
              metadata: { kind: "ask_user_questions", issueId: "i-77" },
            },
            whyNow: "Questions need answers on an issue thread.",
            detail: { kind: "questions", questionCount: 3, firstQuestionText: "Which class do you select for the fall term?", images: [] },
          },
          {
            id: "confirm",
            severity: "medium",
            sourceKind: "issue_thread_interaction",
            activityAt: at(10 * 24 * 60),
            dismissal: null,
            subject: {
              kind: "interaction",
              id: "int-2",
              title: "Confirmation requested",
              identifier: null,
              status: "pending",
              href: "/ACM/issues/ACM-77#interaction-int-2",
              metadata: { kind: "request_confirmation", issueId: "i-77" },
            },
            whyNow: "Confirmation requested on an issue thread.",
            detail: { kind: "confirmation", promptExcerpt: "Ship the release?", isPlanTarget: false, images: [] },
            decisionVerbs: [
              { id: "accept", label: "Ship it", description: "" },
              { id: "reject", label: "Hold", description: "" },
            ],
          },
          {
            id: "low",
            severity: "low",
            sourceKind: "review",
            activityAt: at(900),
            dismissal: null,
            subject: { kind: "issue", id: "i-2", title: "Tidy the README", identifier: "ACM-9", href: null },
            whyNow: "review",
            detail: null,
          },
        ],
      } as never,
      agents: [],
      routines: [],
      issues: [{ id: "i-77", identifier: "ACM-77", title: "Fall class registration", status: "in_review" }] as never,
      nowMs: NOW,
    }),
    ...deriveQueueItems({
      companyId: "c2",
      approvals: [],
      attention: undefined,
      agents: [
        {
          id: "ceo-2",
          name: "Atlas",
          role: "ceo",
          status: "active",
          lastHeartbeatAt: new Date(at(130)),
          runtimeConfig: { heartbeat: { enabled: true, intervalSec: 900 } },
        } as never,
      ],
      routines: [],
      nowMs: NOW,
    }),
  ];
}

describe("PlicaQueue", () => {
  let container: HTMLDivElement;
  const onActed = vi.fn();
  const onGrouping = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockApprovalsApi.approve.mockResolvedValue({ id: "ap-1", status: "approved" });
    onActed.mockReset();
    onGrouping.mockReset();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  const onClearFilter = vi.fn();

  function render(grouping: "severity" | "company" = "severity", filterCompany: Company | null = null) {
    const items = buildItems().filter((item) => !filterCompany || item.companyId === filterCompany.id);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaQueue
              groups={groupQueue(items, grouping, [acme, globex])}
              summary={summarizeQueue(items, NOW)}
              grouping={grouping}
              onGrouping={onGrouping}
              companiesById={{ c1: acme, c2: globex }}
              nowMs={NOW}
              onActed={onActed}
              footer={<span data-testid="footer">since you last looked</span>}
              filterCompany={filterCompany}
              onClearFilter={onClearFilter}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    return root;
  }

  it("lists Now items in order with their actions and folds Later behind a count", () => {
    const root = render();
    const rows = Array.from(container.querySelectorAll("[data-queue-item]")).map((row) => row.getAttribute("data-queue-item"));
    // Now bucket: critical first, then rank ties (heartbeat, approval) oldest first; Later is folded.
    expect(rows).toEqual(["attention:blk", "heartbeat:ceo-2", "approval:ap-1"]);
    expect(container.textContent).toContain("ACM-212");
    expect(container.textContent).toContain("Deploy blocked");
    expect(container.textContent).toContain("Atlas heartbeat overdue");
    expect(container.querySelector('[aria-label="Approve"]')).not.toBeNull();
    expect(container.querySelector('[data-queue-item="heartbeat:ceo-2"] a')).not.toBeNull();
    // Later is folded: the low item is counted, not listed.
    expect(container.textContent).toContain("3 low-priority notices");
    expect(container.querySelector('[data-queue-item="attention:low"]')).toBeNull();
    // header: 3 urgent, oldest is the 130m-old heartbeat
    expect(container.textContent).toContain("oldest 2h");
    expect(container.querySelector('[data-testid="footer"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("expands Later on demand", async () => {
    const root = render();
    const later = container.querySelector('[data-queue-group="later"] button[aria-expanded]') as HTMLButtonElement;
    expect(later.textContent).toContain("Later");
    await act(async () => {
      later.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[data-queue-item="attention:low"]')).not.toBeNull();
    expect(container.textContent).toContain("Tidy the README");
    act(() => root.unmount());
  });

  it("names the issue behind a thread interaction and shows the ask itself", async () => {
    const root = render();
    await act(async () => {
      (container.querySelector('[data-queue-group="later"] button[aria-expanded]') as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const row = container.querySelector('[data-queue-item="attention:ask"]') as HTMLElement;
    expect(row.textContent).toContain("ACM-77");
    expect(row.textContent).toContain("Fall class registration");
    expect(row.textContent).not.toContain("Questions need answers");
    expect(row.querySelector("[data-queue-ask]")?.textContent).toContain("3 questions · Which class do you select for the fall term?");
    expect(row.textContent).toContain("questions");
    expect(row.querySelector('[aria-label="Answer"], a')?.textContent).toContain("Answer");
    act(() => root.unmount());
  });

  it("confirms a plain confirmation inline with the server's verb and refetches", async () => {
    mockIssuesApi.acceptInteraction.mockResolvedValue({ id: "int-2", status: "accepted" });
    const root = render();
    await act(async () => {
      (container.querySelector('[data-queue-group="later"] button[aria-expanded]') as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    const row = container.querySelector('[data-queue-item="attention:confirm"]') as HTMLElement;
    // 10 days old → amber ramp
    expect(row.querySelector("[data-age-tone]")?.getAttribute("data-age-tone")).toBe("aging");
    const accept = row.querySelector('[aria-label="Ship it"]') as HTMLButtonElement;
    expect(row.querySelector('[aria-label="Hold"]')).not.toBeNull();
    await act(async () => {
      accept.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockIssuesApi.acceptInteraction).toHaveBeenCalledWith("i-77", "int-2");
    expect(onActed).toHaveBeenCalledWith("c1");
    act(() => root.unmount());
  });

  it("groups by kind in a fixed order", () => {
    const items = buildItems();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <PlicaQueue
              groups={groupQueue(items, "kind", [acme, globex])}
              summary={summarizeQueue(items, NOW)}
              grouping="kind"
              onGrouping={onGrouping}
              companiesById={{ c1: acme, c2: globex }}
              nowMs={NOW}
              onActed={onActed}
              onClearFilter={onClearFilter}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    // kind grouping: questions, confirmations, approvals, heartbeats, blockers, other(review)
    const headers = Array.from(container.querySelectorAll("[data-queue-group]")).map((group) => group.getAttribute("data-queue-group"));
    expect(headers).toEqual(["questions", "confirmations", "approvals", "heartbeats", "blockers", "other"]);
    act(() => root.unmount());
  });

  it("groups by company when asked, in the given company order", () => {
    const root = render("company");
    const headers = Array.from(container.querySelectorAll("[data-queue-group]")).map((group) => group.getAttribute("data-queue-group"));
    expect(headers).toEqual(["c1", "c2"]);
    const grouping = Array.from(container.querySelectorAll('[aria-label="Queue grouping"] button'));
    expect(grouping.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false", "false"]);
    act(() => {
      grouping[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onGrouping).toHaveBeenCalledWith("severity");
    act(() => root.unmount());
  });

  it("approves from the rail and tells the owning company to refetch", async () => {
    const root = render();
    const approve = container.querySelector('[aria-label="Approve"]') as HTMLButtonElement;
    await act(async () => {
      approve.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockApprovalsApi.approve).toHaveBeenCalledWith("ap-1", undefined);
    expect(onActed).toHaveBeenCalledWith("c1");
    act(() => root.unmount());
  });

  it("shows a clearable chip while filtered to one company", () => {
    const root = render("severity", globex);
    expect(container.textContent).toContain("Only Globex");
    const rows = Array.from(container.querySelectorAll("[data-queue-item]")).map((row) => row.getAttribute("data-queue-item"));
    expect(rows).toEqual(["heartbeat:ceo-2"]);
    act(() => {
      (container.querySelector('[aria-label="Show all companies"]') as HTMLButtonElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(onClearFilter).toHaveBeenCalled();
    act(() => root.unmount());
  });
});
