// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixtureJson from "./demo-data.json";
import { deactivateDemoMode, installDemoFixture } from "./demo-runtime";
import type { DemoFixture } from "./demo-types";
import { PlicaHud } from "../PlicaHud";

vi.mock("../host/shims", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host/shims")>()),
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

const FIXTURE = fixtureJson as unknown as DemoFixture;

/**
 * End-to-end proof that the fixture actually drives the real HUD: no component
 * is mocked here beyond the host breadcrumb shim. If a field the board reads
 * goes missing from the fixture, this fails — which is the failure the unit
 * tests on the router alone would miss.
 */
describe("PlicaHud on demo data", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("demo mode must not reach the network");
    }) as unknown as typeof fetch);
    installDemoFixture(structuredClone(FIXTURE));
  });

  afterEach(() => {
    deactivateDemoMode();
    vi.unstubAllGlobals();
  });

  function renderHud() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PlicaHud demo />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("draws a row for every demo company", async () => {
    renderHud();
    for (const company of FIXTURE.companies) {
      expect(await screen.findByText(company.name)).toBeInTheDocument();
    }
  });

  it("labels itself as demo data so a screenshot cannot be mistaken", async () => {
    renderHud();
    expect(await screen.findByText("Demo data")).toBeInTheDocument();
  });

  it("renders without any request escaping to the network", async () => {
    renderHud();
    await screen.findByText(FIXTURE.companies[0].name);
    await waitFor(() => {
      expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    });
  });
});
