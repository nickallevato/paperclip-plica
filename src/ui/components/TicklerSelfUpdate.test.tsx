import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TicklerSelfUpdatePanel, TicklerUpdateChip } from "./TicklerSelfUpdate";

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** One handler for both reads: the host's plugin record and npm's `latest`. */
function mockFetch(routes: { upgrade?: { status: number; body: unknown }; npm?: string; self?: unknown }) {
  const fn = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.startsWith("https://registry.npmjs.org")) {
      return json(200, { version: routes.npm ?? "0.0.0" });
    }
    if (typeof url === "string" && url.endsWith("/upgrade")) {
      return json(routes.upgrade?.status ?? 200, routes.upgrade?.body ?? {});
    }
    return json(200, routes.self ?? {});
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const AVAILABLE = { status: "available", installed: "0.6.0", latest: "0.7.1" } as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TicklerUpdateChip", () => {
  it("renders nothing when the installed version is the published one", () => {
    const { container } = wrap(<TicklerUpdateChip check={{ status: "current", installed: "0.7.1" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when npm could not be checked", () => {
    const { container } = wrap(<TicklerUpdateChip check={{ status: "unknown" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a local-path install — the reload badge owns that", () => {
    const { container } = wrap(<TicklerUpdateChip check={{ status: "local", installed: "0.6.0" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("upgrades in place to the version on the button, then hands over", async () => {
    const fetchMock = mockFetch({});
    const onUpdated = vi.fn();
    wrap(<TicklerUpdateChip check={AVAILABLE} onUpdated={onUpdated} />);

    fireEvent.click(screen.getByRole("button", { name: /Update to 0\.7\.1/ }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plugins/nickallevato.plugin-tickler/upgrade",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ version: "0.7.1" }) }),
    );
  });

  it("says who can update when the host refuses", async () => {
    mockFetch({ upgrade: { status: 403, body: { error: "Instance admin required" } } });
    const onUpdated = vi.fn();
    wrap(<TicklerUpdateChip check={AVAILABLE} onUpdated={onUpdated} />);

    fireEvent.click(screen.getByRole("button", { name: /Update to/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only an instance admin");
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("points at a reinstall when the new version wants a new capability", async () => {
    mockFetch({
      upgrade: {
        status: 400,
        body: {
          error:
            'Upgrade for "nickallevato.plugin-tickler" introduces new capabilities that require approval: issues.write',
        },
      },
    });
    wrap(<TicklerUpdateChip check={AVAILABLE} />);

    fireEvent.click(screen.getByRole("button", { name: /Update to/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Uninstall and reinstall Tickler");
  });

  it("reads the registration and npm, and offers the newer version", async () => {
    mockFetch({ self: { version: "0.6.0", packagePath: null }, npm: "0.7.1" });
    wrap(<TicklerUpdateChip />);
    expect(await screen.findByRole("button", { name: /Update to 0\.7\.1/ })).toBeInTheDocument();
  });
});

describe("TicklerSelfUpdatePanel", () => {
  it("reports being up to date, with no update button", () => {
    wrap(<TicklerSelfUpdatePanel check={{ status: "current", installed: "0.7.1" }} />);
    expect(screen.getByText("Tickler 0.7.1")).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Update to/ })).toBeNull();
  });

  it("offers the update and explains that settings survive it", () => {
    wrap(<TicklerSelfUpdatePanel check={AVAILABLE} />);
    expect(screen.getByRole("button", { name: /Update to 0\.7\.1/ })).toBeInTheDocument();
    expect(screen.getByText(/settings and token thresholds are kept/)).toBeInTheDocument();
  });

  it("still names a version when the registration could not be read", () => {
    // Falls back to the bundle this page is running, so the panel is never blank.
    wrap(<TicklerSelfUpdatePanel check={{ status: "unknown" }} />);
    expect(screen.getByText(/^Tickler \d+\.\d+\.\d+$/)).toBeInTheDocument();
    expect(screen.getByText(/Could not check npm/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });

  it("points a local-path install at its own build, with nothing to click", () => {
    wrap(<TicklerSelfUpdatePanel check={{ status: "local", installed: "0.6.0" }} />);
    expect(screen.getByText(/local checkout/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
