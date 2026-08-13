import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlicaLink } from "./PlicaLink";
import { TEST_COMPANY_ID, installTestBridge } from "../../test/bridge";

/**
 * The original test asserted PlicaLink called
 * `setSelectedCompanyId(id, { source: "route_sync" })` and then SPA-navigated.
 * Plugin UI cannot reach the host's CompanyContext, so cross-company clicks are
 * now a full document load; these assertions cover that replacement contract.
 */
describe("PlicaLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubAssign() {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    return assign;
  }

  it("renders a real anchor with the target href", () => {
    render(<PlicaLink to="/ACME/issues/PAP-1">Open</PlicaLink>);
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/ACME/issues/PAP-1",
    );
  });

  it("navigates in-app when the target is the current company", async () => {
    const { navigate } = installTestBridge();
    const assign = stubAssign();

    render(
      <PlicaLink to="/ACME/issues/PAP-1" companyId={TEST_COMPANY_ID}>
        Open
      </PlicaLink>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Open" }));

    expect(navigate).toHaveBeenCalledWith("/ACME/issues/PAP-1");
    expect(assign).not.toHaveBeenCalled();
  });

  it("does a full document load when the target is another company", async () => {
    const { navigate } = installTestBridge();
    const assign = stubAssign();

    render(
      <PlicaLink to="/OTHER/issues/OTH-1" companyId="company-2">
        Open
      </PlicaLink>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Open" }));

    // A reload is required: the host blocks URL-driven company sync for the
    // rest of the session after any manual switch, so an SPA hop would leave
    // the chrome pointing at the old company.
    expect(assign).toHaveBeenCalledWith("/OTHER/issues/OTH-1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("treats a link without companyId as same-company", async () => {
    const { navigate } = installTestBridge();
    const assign = stubAssign();

    render(<PlicaLink to="/ACME/projects">Projects</PlicaLink>);
    await userEvent.click(screen.getByRole("link", { name: "Projects" }));

    expect(navigate).toHaveBeenCalledWith("/ACME/projects");
    expect(assign).not.toHaveBeenCalled();
  });

  it("leaves modifier clicks to the browser", async () => {
    const { navigate } = installTestBridge();
    const assign = stubAssign();

    render(
      <PlicaLink to="/OTHER/issues/OTH-1" companyId="company-2">
        Open
      </PlicaLink>,
    );
    // fireEvent rather than userEvent: the modifier must be on the click event
    // itself, which is what PlicaLink inspects before calling preventDefault.
    fireEvent.click(screen.getByRole("link", { name: "Open" }), { metaKey: true });

    expect(navigate).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
