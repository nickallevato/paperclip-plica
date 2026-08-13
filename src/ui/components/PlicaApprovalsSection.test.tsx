// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlicaApprovalsSection } from "./PlicaApprovalsSection";

const mockApprovalsApi = vi.hoisted(() => ({ approve: vi.fn(), reject: vi.fn(), listIssues: vi.fn() }));
vi.mock("../host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/api")>()),
  approvalsApi: mockApprovalsApi,
}));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
  useToastActions: () => ({ pushToast: toastSpy }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const company = { id: "company-1", name: "Acme", issuePrefix: "ACM", status: "active" } as never;
const approval = {
  id: "approval-1",
  companyId: "company-1",
  type: "budget_increase",
  status: "pending",
  payload: { reason: "Need more tokens" },
  createdAt: new Date("2026-07-28T10:00:00Z"),
} as never;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("PlicaApprovalsSection", () => {
  let container: HTMLDivElement;
  const onActed = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockApprovalsApi.approve.mockResolvedValue({ id: "approval-1", status: "approved" });
    mockApprovalsApi.reject.mockResolvedValue({ id: "approval-1", status: "rejected" });
    onActed.mockReset();
    toastSpy.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  function render(open: boolean) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
          <PlicaApprovalsSection approvals={[approval]} company={company} open={open} onActed={onActed} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    return root;
  }

  it("renders nothing when closed", () => {
    const root = render(false);
    expect(container.textContent).not.toContain("budget_increase");
    act(() => root.unmount());
  });

  it("approves a pending approval", async () => {
    const root = render(true);
    const approveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.getAttribute("aria-label") === "Approve");
    expect(approveButton).not.toBeUndefined();
    await act(async () => {
      approveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(mockApprovalsApi.approve).toHaveBeenCalledWith("approval-1", undefined);
    expect(onActed).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("rejects a pending approval", async () => {
    const root = render(true);
    const rejectButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.getAttribute("aria-label") === "Reject");
    await act(async () => {
      rejectButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(mockApprovalsApi.reject).toHaveBeenCalledWith("approval-1", undefined);
    expect(onActed).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("expands to show payload entries and passes a typed decision note on approve", async () => {
    const root = render(true);
    const toggleButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("budget_increase"));
    expect(toggleButton).not.toBeUndefined();
    await act(async () => {
      toggleButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("reason:");
    expect(container.textContent).toContain("Need more tokens");

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, "note text");
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });

    const approveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Approve"));
    await act(async () => {
      approveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(mockApprovalsApi.approve).toHaveBeenCalledWith("approval-1", "note text");
    expect(onActed).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("surfaces a toast when approve fails", async () => {
    mockApprovalsApi.approve.mockRejectedValue(new Error("boom"));
    const root = render(true);
    const approveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.getAttribute("aria-label") === "Approve");
    await act(async () => {
      approveButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ tone: "error" }));
    expect(onActed).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("surfaces a toast when reject fails", async () => {
    mockApprovalsApi.reject.mockRejectedValue(new Error("boom"));
    const root = render(true);
    const rejectButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.getAttribute("aria-label") === "Reject");
    await act(async () => {
      rejectButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ tone: "error" }));
    expect(onActed).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("shows the linked issue description in a hover preview", async () => {
    mockApprovalsApi.listIssues.mockResolvedValue([
      { id: "i1", identifier: "ACM-4", title: "Raise budget for Q3", status: "in_review", description: "CEO requests a bump to cover launch traffic." },
    ]);
    const root = render(true);
    const trigger = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("budget_increase"));
    expect(trigger).not.toBeUndefined();
    await act(async () => {
      trigger!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await vi.waitFor(() => {
      // The preview is portaled (Radix Popover) — query the document, not the container.
      const panel = document.querySelector("[data-approval-preview]");
      expect(panel).not.toBeNull();
      expect(panel?.textContent).toContain("Raise budget for Q3");
      expect(panel?.textContent).toContain("CEO requests a bump");
      expect(panel?.textContent).toContain("ACM-4");
    });
    act(() => root.unmount());
  });
});
