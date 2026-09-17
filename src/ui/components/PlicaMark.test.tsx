// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PlicaMark } from "./PlicaMark";

describe("PlicaMark", () => {
  it("draws both faces of the fold in currentColor, the right one held back", () => {
    const { container } = render(<PlicaMark />);
    const paths = [...container.querySelectorAll("path")];
    expect(paths).toHaveLength(2);
    // One colour at two opacities, not two colours: the mark has to track the
    // text colour it sits beside through hover and dark mode.
    expect(paths.map((path) => path.getAttribute("fill"))).toEqual(["currentColor", "currentColor"]);
    expect(paths[0].getAttribute("fill-opacity")).toBeNull();
    expect(paths[1].getAttribute("fill-opacity")).toBe("0.42");
  });

  it("is decorative, and sizes to its class rather than to a parent", () => {
    const { container } = render(<PlicaMark className="h-3.5 w-3.5" />);
    const svg = container.querySelector("svg")!;
    // Every caller labels the control around it, so the mark itself is never
    // announced.
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("h-3.5", "w-3.5");
    // Presentation attributes, so the class above still wins — they only stop
    // an unsized instance from filling its parent.
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });
});
