import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PlicaReloadBadge } from "./PlicaReloadBadge";

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const RELOAD = { status: "reload", installed: "0.4.0", bundled: "0.5.0" } as const;

describe("PlicaReloadBadge", () => {
  it("renders nothing when the registration is current", () => {
    const { container } = wrap(<PlicaReloadBadge check={{ status: "current" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when it cannot tell", () => {
    const { container } = wrap(<PlicaReloadBadge check={{ status: "unknown" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("upgrades in place and hands over once the host accepts", async () => {
    const fetchMock = mockFetch(200, { version: "0.5.0" });
    const onReloaded = vi.fn();
    wrap(<PlicaReloadBadge check={RELOAD} onReloaded={onReloaded} />);

    fireEvent.click(screen.getByRole("button", { name: /Reload 0\.5\.0/ }));

    await waitFor(() => expect(onReloaded).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plugins/nickallevato.plugin-plica/upgrade",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("says who can reload when the host refuses", async () => {
    mockFetch(403, { error: "Instance admin required" });
    const onReloaded = vi.fn();
    wrap(<PlicaReloadBadge check={RELOAD} onReloaded={onReloaded} />);

    fireEvent.click(screen.getByRole("button", { name: /Reload/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only an instance admin");
    expect(onReloaded).not.toHaveBeenCalled();
  });

  it("points at a reinstall, without a button, when capabilities were added", () => {
    wrap(
      <PlicaReloadBadge check={{ status: "reinstall", installed: "0.4.0", bundled: "0.5.0", added: ["issues.write"] }} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Reinstall needed");
    expect(alert.getAttribute("title")).toContain("issues.write");
  });

  it("reads the registration and offers a reload when the bundle is newer", async () => {
    mockFetch(200, { version: "0.0.1", manifestJson: { capabilities: ["ui.page.register", "ui.action.register", "companies.read", "projects.read", "issues.read", "agents.read", "approvals.read", "activity.read"] } });
    wrap(<PlicaReloadBadge />);
    expect(await screen.findByRole("button", { name: /Reload/ })).toBeInTheDocument();
  });
});
