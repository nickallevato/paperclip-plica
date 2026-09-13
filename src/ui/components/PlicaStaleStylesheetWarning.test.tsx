import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlicaStaleStylesheetWarning } from "./PlicaStaleStylesheetWarning";
import type { HostCssRecord } from "../lib/host-stylesheet";

const RECORDED: HostCssRecord = { file: "index-BU41-p9M.css", hash: "sha256-0123456789abcdef" };

afterEach(() => {
  document.head.innerHTML = "";
});

describe("PlicaStaleStylesheetWarning", () => {
  it("names the fix and both identifiers on a mismatch", () => {
    render(
      <PlicaStaleStylesheetWarning check={{ status: "mismatch", recorded: RECORDED, observed: "index-ZZ99-newr.css" }} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("pnpm build");
    expect(alert).toHaveTextContent("index-BU41-p9M.css");
    expect(alert).toHaveTextContent("sha256-0123456789abcdef");
    expect(alert).toHaveTextContent("index-ZZ99-newr.css");
  });

  it("shows a short chip, with the detail in the hover text", () => {
    // The owner chose the quiet badge over the banner (issue #5, Q2). What is
    // visible has to stay chip-sized; the identifiers move to the tooltip.
    render(
      <PlicaStaleStylesheetWarning check={{ status: "mismatch", recorded: RECORDED, observed: "index-ZZ99-newr.css" }} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.firstElementChild?.tagName.toLowerCase()).not.toBe("p");
    expect(alert).toHaveAttribute("title", expect.stringContaining("pnpm build"));
    expect(alert.getAttribute("title")).toContain("index-BU41-p9M.css");
    expect(alert.getAttribute("title")).toContain("index-ZZ99-newr.css");
  });

  it("repeats the detail for assistive technology, which cannot hover", () => {
    // A title attribute alone would make the quiet shape mean the identifiers
    // are unreachable without a mouse.
    const { container } = render(
      <PlicaStaleStylesheetWarning check={{ status: "mismatch", recorded: RECORDED, observed: "index-ZZ99-newr.css" }} />,
    );
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toContain("pnpm build");
    expect(srOnly?.textContent).toContain("index-ZZ99-newr.css");
  });

  it("renders nothing on a match", () => {
    const { container } = render(
      <PlicaStaleStylesheetWarning check={{ status: "match", recorded: RECORDED, observed: RECORDED.file }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the host sheet could not be resolved", () => {
    const { container } = render(
      <PlicaStaleStylesheetWarning check={{ status: "unknown", recorded: RECORDED, observed: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("stays silent by default in a document with no recorded build", () => {
    // No `__PLICA_HOST_CSS_BUILD__` and no <link>: the two ways the check can
    // fail to answer. Both must be silent rather than a false alarm.
    const { container } = render(<PlicaStaleStylesheetWarning />);
    expect(container).toBeEmptyDOMElement();
  });
});
