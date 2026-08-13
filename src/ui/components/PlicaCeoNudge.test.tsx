// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlicaCeoNudge } from "./PlicaCeoNudge";

const mockIssuesApi = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/api")>()),
  issuesApi: mockIssuesApi,
}));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
  useToastActions: () => ({ pushToast: toastSpy }),
}));

// Radix Popover portals don't open under jsdom without pointer-event
// polyfills; mock with pass-through elements (mirrors PlicaQuickActions.test.tsx).
vi.mock("../host/ui-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/ui-kit")>()),
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  expect(button, `button "${text}"`).not.toBeUndefined();
  return act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  return act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
}

const company = { id: "company-1", name: "Acme", issuePrefix: "ACM", status: "active" } as never;
const ceo = { id: "agent-ceo", name: "Prime", role: "ceo", status: "active" } as never;

describe("PlicaCeoNudge", () => {
  let container: HTMLDivElement;
  const onActed = vi.fn();

  function render() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <PlicaCeoNudge company={company} ceo={ceo} onActed={onActed} />
        </QueryClientProvider>,
      );
    });
    return root;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockIssuesApi.create.mockResolvedValue({ id: "issue-1", identifier: "ACM-42" });
    onActed.mockReset();
    toastSpy.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("sends the expected payload including high priority, CEO assignee, and a 140-char truncated title", async () => {
    const root = render();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    const longFirstLine = "x".repeat(200);
    const draft = `${longFirstLine}\nsecond line with more detail`;
    await setTextareaValue(textarea, draft);

    await clickButton(container, "Send");
    await flush();

    expect(mockIssuesApi.create).toHaveBeenCalledTimes(1);
    const [companyId, payload] = mockIssuesApi.create.mock.calls[0];
    expect(companyId).toBe("company-1");
    expect(payload.title).toBe(longFirstLine.slice(0, 140));
    expect(payload.title.length).toBe(140);
    expect(payload.description).toBe(draft);
    expect(payload.priority).toBe("high");
    expect(payload.assigneeAgentId).toBe("agent-ceo");
    expect(typeof payload.idempotencyKey).toBe("string");
    expect(payload.idempotencyKey.length).toBeGreaterThan(0);

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nudge sent to Prime", body: "ACM-42" }),
    );
    expect(onActed).toHaveBeenCalled();

    // Draft cleared on success.
    const textareaAfter = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textareaAfter.value).toBe("");

    act(() => root.unmount());
  });

  it("keeps the draft and shows an error toast on failure", async () => {
    mockIssuesApi.create.mockRejectedValue(new Error("server exploded"));
    const root = render();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await setTextareaValue(textarea, "please look at this");

    await clickButton(container, "Send");
    await flush();

    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ tone: "error" }));
    expect(onActed).not.toHaveBeenCalled();

    const textareaAfter = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textareaAfter.value).toBe("please look at this");

    act(() => root.unmount());
  });
});
