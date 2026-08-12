import { describe, expect, it } from "vitest";
import { cn, priorityColor, priorityColorDefault, queryKeys, toCompanyRelativePath } from "./util";

describe("host/util", () => {
  describe("cn", () => {
    it("resolves conflicting tailwind classes to the last one", () => {
      expect(cn("px-2", "px-4")).toBe("px-4");
    });

    it("drops falsy entries", () => {
      expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
    });
  });

  describe("priorityColor", () => {
    it("maps each known priority to a distinct class", () => {
      expect(priorityColor.critical).not.toBe(priorityColor.low);
      expect(priorityColor.high).toBeTruthy();
      expect(priorityColor.medium).toBeTruthy();
    });

    it("exposes a default for unknown priorities", () => {
      expect(priorityColorDefault).toBeTruthy();
      expect(priorityColor.nonsense).toBeUndefined();
    });
  });

  describe("queryKeys.plica", () => {
    it("scopes each key by company id", () => {
      expect(queryKeys.plica.summary("c1")).toEqual(["plica", "summary", "c1"]);
      expect(queryKeys.plica.liveRuns("c2")).toEqual(["plica", "live-runs", "c2"]);
      expect(queryKeys.plica.briefingIssues("c3")).toEqual(["plica", "briefing-issues", "c3"]);
    });

    it("exposes the auth session key", () => {
      expect(queryKeys.auth.session).toEqual(["auth", "session"]);
    });
  });

  describe("toCompanyRelativePath", () => {
    it("strips a leading company prefix from a board path", () => {
      expect(toCompanyRelativePath("/ACME/issues/PAP-1")).toBe("/issues/PAP-1");
    });

    it("leaves an already-relative board path alone", () => {
      expect(toCompanyRelativePath("/issues/PAP-1")).toBe("/issues/PAP-1");
    });

    it("preserves search and hash", () => {
      expect(toCompanyRelativePath("/ACME/issues?tab=all#top")).toBe("/issues?tab=all#top");
    });

    it("does not strip the first segment of a global route", () => {
      expect(toCompanyRelativePath("/instance/settings")).toBe("/instance/settings");
    });

    it("treats /plica as company-scoped, not global", () => {
      // The v4 customization added "plica" to GLOBAL_ROUTE_ROOTS because /plica
      // was a root-level route. As a plugin page it lives at /:prefix/plica, so
      // the vendored copy tracks upstream and omits that entry.
      expect(toCompanyRelativePath("/ACME/plica")).toBe("/ACME/plica");
    });
  });
});
