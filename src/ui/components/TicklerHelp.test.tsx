// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TicklerHelp, TICKLER_DISCORD_URL } from "./TicklerHelp";

describe("TicklerHelp", () => {
  it("says nothing until asked", () => {
    render(<TicklerHelp />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Help and feedback" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens on the ? and points at the Discord thread, in a new tab", () => {
    render(<TicklerHelp />);
    fireEvent.click(screen.getByRole("button", { name: "Help and feedback" }));

    const link = screen.getByRole("link", { name: "Open the Tickler thread" });
    expect(link).toHaveAttribute("href", TICKLER_DISCORD_URL);
    // Leaving the page would lose whatever the board was in the middle of.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    // The disclaimer is the whole reason the panel exists: a plugin's bug
    // reported to Paperclip is a bug nobody who can fix it will see.
    expect(screen.getByRole("dialog").textContent).toContain("community plugin");
  });

  it("is not portalled, so kiosk mode's fullscreen still paints it", () => {
    const { container } = render(<TicklerHelp />);
    fireEvent.click(screen.getByRole("button", { name: "Help and feedback" }));
    expect(container.querySelector("[data-tickler-help] [role=dialog]")).not.toBeNull();
  });

  it("closes on Escape, on a click outside, and on following the link", () => {
    render(
      <div>
        <TicklerHelp />
        <button type="button">elsewhere</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "Help and feedback" });

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("link", { name: "Open the Tickler thread" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays open for a click on its own body", () => {
    render(<TicklerHelp />);
    fireEvent.click(screen.getByRole("button", { name: "Help and feedback" }));
    const panel = screen.getByRole("dialog");
    fireEvent.pointerDown(panel);
    expect(screen.queryByRole("dialog")).toBe(panel);
  });
});
