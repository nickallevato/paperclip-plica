// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearDraft, draftKeyFor, loadDraft, saveDraft } from "./PlicaInteractionActions";

describe("interaction drafts", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a draft per interaction and drops it when emptied or cleared", () => {
    const key = draftKeyFor("int-1");
    expect(key).toBe("plica.interactionDraft.int-1");
    saveDraft(key, { answers: { q1: { optionIds: ["a"], otherText: "" } }, summary: "" }, false);
    expect(loadDraft<{ answers: Record<string, unknown> }>(key)?.answers).toEqual({ q1: { optionIds: ["a"], otherText: "" } });
    expect(loadDraft(draftKeyFor("int-2"))).toBeNull();
    saveDraft(key, { answers: {}, summary: "" }, true);
    expect(loadDraft(key)).toBeNull();
    saveDraft(key, { selected: ["x"] }, false);
    clearDraft(key);
    expect(loadDraft(key)).toBeNull();
  });

  it("treats unreadable storage as no draft", () => {
    localStorage.setItem("plica.interactionDraft.bad", "{not json");
    expect(loadDraft("plica.interactionDraft.bad")).toBeNull();
  });
});
