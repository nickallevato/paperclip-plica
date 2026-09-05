import { afterEach, describe, expect, it } from "vitest";
import {
  checkHostStylesheet,
  documentStylesheetFiles,
  recordedHostCss,
  resolveHostStylesheet,
  type HostCssRecord,
} from "./host-stylesheet";

const RECORDED: HostCssRecord = { file: "index-BU41-p9M.css", hash: "sha256-0123456789abcdef" };

/** Build a document carrying the given stylesheet hrefs, plus Plica's own tag. */
function documentWith(hrefs: string[]): Document {
  document.head.innerHTML = "";
  for (const href of hrefs) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute("href", href);
    document.head.appendChild(link);
  }
  const own = document.createElement("style");
  own.id = "plica-plugin-styles";
  own.textContent = ".plica-probe{color:red}";
  document.head.appendChild(own);
  return document;
}

afterEach(() => {
  document.head.innerHTML = "";
  delete (globalThis as Record<string, unknown>).__PLICA_HOST_CSS_BUILD__;
});

describe("checkHostStylesheet", () => {
  it("matches when the document serves the sheet the build subtracted against", () => {
    const check = checkHostStylesheet(documentWith(["/assets/index-BU41-p9M.css"]), RECORDED);
    expect(check).toEqual({ status: "match", recorded: RECORDED, observed: "index-BU41-p9M.css" });
  });

  it("reports a mismatch, with both identifiers, after the host is rebuilt under a new hash", () => {
    const check = checkHostStylesheet(documentWith(["/assets/index-ZZ99-newr.css"]), RECORDED);
    expect(check.status).toBe("mismatch");
    expect(check.recorded?.file).toBe("index-BU41-p9M.css");
    expect(check.observed).toBe("index-ZZ99-newr.css");
  });

  it("fails open when the document carries no stylesheet link at all", () => {
    expect(checkHostStylesheet(documentWith([]), RECORDED)).toEqual({
      status: "unknown",
      recorded: RECORDED,
      observed: null,
    });
  });

  it("fails open when the bundle carries no build-time record", () => {
    const check = checkHostStylesheet(documentWith(["/assets/index-ZZ99-newr.css"]), null);
    expect(check).toEqual({ status: "unknown", recorded: null, observed: null });
  });

  it("fails open with no document (SSR, worker)", () => {
    expect(checkHostStylesheet(undefined, RECORDED).status).toBe("unknown");
  });

  it("fails open when several same-stem sheets make the host's ambiguous", () => {
    const check = checkHostStylesheet(documentWith(["/assets/index-aaaaaaaa.css", "/assets/index-bbbbbbbb.css"]), RECORDED);
    expect(check.status).toBe("unknown");
    expect(check.observed).toBeNull();
  });
});

describe("resolveHostStylesheet", () => {
  it("takes the only same-origin sheet, even when the host renamed its entry chunk", () => {
    expect(resolveHostStylesheet(documentWith(["/assets/app-QQ11-rrrr.css"]), RECORDED.file)).toBe("app-QQ11-rrrr.css");
  });

  it("narrows several sheets to the one sharing the recorded stem", () => {
    const doc = documentWith(["/assets/vendor-9f9f9f9f.css", "/assets/index-ZZ99-newr.css", "/assets/print-1a1a1a1a.css"]);
    expect(resolveHostStylesheet(doc, RECORDED.file)).toBe("index-ZZ99-newr.css");
  });

  it("gives up when no sheet shares the recorded stem and there is more than one", () => {
    const doc = documentWith(["/assets/vendor-9f9f9f9f.css", "/assets/print-1a1a1a1a.css"]);
    expect(resolveHostStylesheet(doc, RECORDED.file)).toBeNull();
  });
});

describe("documentStylesheetFiles", () => {
  it("ignores cross-origin sheets and Plica's own injected tag", () => {
    const doc = documentWith(["https://fonts.example.com/inter.css", "/assets/index-BU41-p9M.css"]);
    expect(documentStylesheetFiles(doc)).toEqual(["index-BU41-p9M.css"]);
  });

  it("ignores non-CSS and preload links", () => {
    document.head.innerHTML = "";
    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.setAttribute("href", "/assets/index-BU41-p9M.css");
    document.head.appendChild(preload);
    const icon = document.createElement("link");
    icon.rel = "stylesheet";
    icon.setAttribute("href", "/favicon.svg");
    document.head.appendChild(icon);
    expect(documentStylesheetFiles(document)).toEqual([]);
  });

  it("strips query strings and reads the filename from the path", () => {
    expect(documentStylesheetFiles(documentWith(["/assets/index-BU41-p9M.css?v=2"]))).toEqual(["index-BU41-p9M.css"]);
  });
});

describe("recordedHostCss", () => {
  it("is null when the bundle was built without a record", () => {
    expect(recordedHostCss()).toBeNull();
  });

  it("reads the value esbuild inlines", () => {
    (globalThis as Record<string, unknown>).__PLICA_HOST_CSS_BUILD__ = RECORDED;
    expect(recordedHostCss()).toEqual(RECORDED);
  });

  it("rejects a malformed record rather than comparing against nonsense", () => {
    (globalThis as Record<string, unknown>).__PLICA_HOST_CSS_BUILD__ = { file: "", hash: "" };
    expect(recordedHostCss()).toBeNull();
  });
});
