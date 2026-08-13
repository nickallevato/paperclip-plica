import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlicaSidebarPanel } from "./PlicaSidebarPanel";
import { installTestBridge } from "../test/bridge";

describe("PlicaSidebarPanel", () => {
  it("links to the company-prefixed plica route", () => {
    render(<PlicaSidebarPanel context={{ companyPrefix: "LIOA" }} />);
    expect(screen.getByRole("link", { name: /Plica/ })).toHaveAttribute("href", "/LIOA/plica");
  });

  it("falls back to the host context prefix when the slot passes none", () => {
    render(<PlicaSidebarPanel />);
    // installTestBridge defaults companyPrefix to ACME.
    expect(screen.getByRole("link", { name: /Plica/ })).toHaveAttribute("href", "/ACME/plica");
  });

  it("navigates in-app, since plica is always same-company", async () => {
    const { navigate } = installTestBridge();
    render(<PlicaSidebarPanel context={{ companyPrefix: "LIOA" }} />);
    await userEvent.click(screen.getByRole("link", { name: /Plica/ }));
    expect(navigate).toHaveBeenCalledWith("/LIOA/plica");
  });
});
