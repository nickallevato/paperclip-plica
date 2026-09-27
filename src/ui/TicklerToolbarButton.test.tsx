import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicklerToolbarButton } from "./TicklerToolbarButton";
import { installTestBridge } from "../test/bridge";

describe("TicklerToolbarButton", () => {
  it("links to the company-prefixed tickler route", () => {
    render(<TicklerToolbarButton context={{ companyPrefix: "LIOA" }} />);
    expect(screen.getByRole("link", { name: /Tickler/ })).toHaveAttribute("href", "/LIOA/tickler");
  });

  it("carries the brand mark, which stays out of the accessible name", () => {
    const { container } = render(<TicklerToolbarButton context={{ companyPrefix: "LIOA" }} />);
    expect(container.querySelector("[data-tickler-mark]")).not.toBeNull();
    // The link is labelled once, by its own aria-label.
    expect(screen.getByRole("link", { name: "Tickler — all orgs" })).toBeInTheDocument();
  });

  it("falls back to the host context prefix when the slot passes none", () => {
    render(<TicklerToolbarButton />);
    // installTestBridge defaults companyPrefix to ACME.
    expect(screen.getByRole("link", { name: /Tickler/ })).toHaveAttribute("href", "/ACME/tickler");
  });

  it("navigates in-app, since tickler is always same-company", async () => {
    const { navigate } = installTestBridge();
    render(<TicklerToolbarButton context={{ companyPrefix: "LIOA" }} />);
    await userEvent.click(screen.getByRole("link", { name: /Tickler/ }));
    expect(navigate).toHaveBeenCalledWith("/LIOA/tickler");
  });
});
