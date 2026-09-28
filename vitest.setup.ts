import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { installTestBridge } from "./src/test/bridge";

// Run from a git hook, the suite inherits GIT_DIR, GIT_INDEX_FILE and friends,
// which point every child `git` at this repo whatever its cwd. The worktree
// tests build scratch repos in a temp dir, so with those set they rewrote the
// real one instead: core.bare=true, a junk "initial" commit, a stray branch.
// Dropped here, once, so no test has to remember to scrub its own env.
for (const name of [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
]) {
  delete process.env[name];
}

// Every component test renders through the SDK's UI hooks, which need the host
// bridge present on globalThis. Installing it fresh before each test keeps the
// vi.fn() handles (navigate, toast) isolated between tests; individual suites
// can re-install with overrides when they need to assert on those handles.
beforeEach(() => {
  installTestBridge();
  blockCrossOriginFetch();
});

/**
 * No test has business reaching a real server.
 *
 * jsdom leaves a working `fetch` on the global, so a component that reads a
 * third party — `lib/self-update` asks registry.npmjs.org which Tickler is
 * published — would make a real request from every suite that renders it, and
 * the suite would then be as reliable as somebody's network. Only absolute URLs
 * are refused: a relative `/api/...` never leaves jsdom, and every suite that
 * asserts on one already stubs `fetch` itself.
 *
 * A suite that wants a cross-origin answer stubs `fetch` like any other — this
 * is the default, not a wall.
 */
function blockCrossOriginFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/^https?:\/\//i.test(url)) {
      throw new TypeError(
        `Blocked a cross-origin fetch to ${url} from a test. Stub globalThis.fetch if the suite needs it.`,
      );
    }
    throw new TypeError(`No fetch stub for ${url}. Stub globalThis.fetch in the suite.`);
  }) as typeof fetch;
}
