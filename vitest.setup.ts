import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { installTestBridge } from "./src/test/bridge";

// Every component test renders through the SDK's UI hooks, which need the host
// bridge present on globalThis. Installing it fresh before each test keeps the
// vi.fn() handles (navigate, toast) isolated between tests; individual suites
// can re-install with overrides when they need to assert on those handles.
beforeEach(() => {
  installTestBridge();
});
