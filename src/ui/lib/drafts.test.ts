import { afterEach, describe, expect, it } from "vitest";
import { releaseStrandedPointerEvents } from "./drafts";

describe("releaseStrandedPointerEvents", () => {
  afterEach(() => {
    document.body.style.removeProperty("pointer-events");
    document.body.innerHTML = "";
  });

  it("clears a stranded pointer-events lock left behind by a closed modal", () => {
    document.body.style.pointerEvents = "none";
    expect(releaseStrandedPointerEvents()).toBe(true);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("leaves a dialog that is genuinely open alone", () => {
    document.body.style.pointerEvents = "none";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    // Releasing here would let clicks through to the page behind a real modal.
    expect(releaseStrandedPointerEvents()).toBe(false);
    expect(document.body.style.pointerEvents).toBe("none");
  });

  it("does nothing when the body was never locked", () => {
    expect(releaseStrandedPointerEvents()).toBe(false);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("does not disturb a pointer-events value someone else set deliberately", () => {
    document.body.style.pointerEvents = "auto";
    expect(releaseStrandedPointerEvents()).toBe(false);
    expect(document.body.style.pointerEvents).toBe("auto");
  });
});
