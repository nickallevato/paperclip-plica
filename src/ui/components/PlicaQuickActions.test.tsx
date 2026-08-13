// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlicaQuickActions } from "./PlicaQuickActions";

const mockIssuesApi = vi.hoisted(() => ({ addComment: vi.fn(), update: vi.fn() }));
vi.mock("../host/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/api")>()),
  issuesApi: mockIssuesApi,
}));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
  useToastActions: () => ({ pushToast: toastSpy }),
}));

// Radix Popover/DropdownMenu portals don't open under jsdom without pointer-event
// polyfills; mock with pass-through elements (mirrors NewIssueDialog.test.tsx:210).
vi.mock("../host/ui-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/ui-kit")>()),
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));


// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.includes(text));
  expect(button, `button "${text}"`).not.toBeUndefined();
  return act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("PlicaQuickActions", () => {
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
          <PlicaQuickActions issueId="issue-1" issueStatus="todo" onActed={onActed} />
        </QueryClientProvider>,
      );
    });
    return root;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockIssuesApi.addComment.mockResolvedValue({ id: "comment-1" });
    mockIssuesApi.update.mockResolvedValue({ id: "issue-1", status: "in_progress" });
    onActed.mockReset();
    toastSpy.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("posts a comment and reports back", async () => {
    const root = render();
    await clickButton(container, "Comment");
    const textarea = document.body.querySelector("textarea");
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea!, "please pick this up");
      textarea!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await clickButton(document.body, "Send");
    await flush();

    expect(mockIssuesApi.addComment).toHaveBeenCalledWith("issue-1", "please pick this up");
    expect(onActed).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("changes status via the status menu", async () => {
    const root = render();
    await clickButton(container, "Todo");
    await clickButton(document.body, "In Progress");
    await flush();

    expect(mockIssuesApi.update).toHaveBeenCalledWith("issue-1", { status: "in_progress" });
    expect(onActed).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("surfaces a toast and keeps the popover with the typed comment when addComment fails", async () => {
    mockIssuesApi.addComment.mockRejectedValue(new Error("server exploded"));
    const root = render();
    await clickButton(container, "Comment");
    const textarea = document.body.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, "please pick this up");
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await clickButton(document.body, "Send");
    await flush();

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error" }),
    );
    expect(onActed).not.toHaveBeenCalled();
    // Popover stayed open and the typed comment was not lost.
    const textareaAfter = document.body.querySelector("textarea") as HTMLTextAreaElement;
    expect(textareaAfter).not.toBeNull();
    expect(textareaAfter.value).toBe("please pick this up");

    act(() => root.unmount());
  });

  it("surfaces a toast when a status/priority update fails", async () => {
    mockIssuesApi.update.mockRejectedValue(new Error("server exploded"));
    const root = render();
    await clickButton(container, "Todo");
    await clickButton(document.body, "In Progress");
    await flush();

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error" }),
    );
    expect(onActed).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
